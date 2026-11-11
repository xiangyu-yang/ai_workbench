import { and, asc, eq, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { messages, tasks, threads, type Task } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { env } from '@/server/env';
import { runAgent, type RunOutcome } from '@/server/agent/runtime';
import type { RuntimeEvent } from '@/server/agent/events';
import { appendTaskEvent } from './events';
import { nextCronTime, parseCron } from './cron';

type RunnerState = {
  active: number;
  pumping: boolean;
  queue: Set<string>;
  controllers: Map<string, AbortController>;
  schedulerStarted: boolean;
};

const g = globalThis as unknown as { __cuter_runner?: RunnerState };
const state: RunnerState = (g.__cuter_runner ||= {
  active: 0,
  pumping: false,
  queue: new Set(),
  controllers: new Map(),
  schedulerStarted: false,
});

const INSTANCE_ID = `inst_${Math.random().toString(36).slice(2, 10)}`;

export function enqueueTask(taskId: string): void {
  ensureScheduler();
  state.queue.add(taskId);
  void pump();
}

async function pump(): Promise<void> {
  if (state.pumping) return;
  state.pumping = true;
  try {
    while (state.active < env.TASK_CONCURRENCY && state.queue.size > 0) {
      const id = state.queue.values().next().value as string | undefined;
      if (!id) break;
      state.queue.delete(id);
      state.active += 1;
      void executeTask(id)
        .catch((err) => console.error('[cuter] 任务执行异常', id, err))
        .finally(() => {
          state.active -= 1;
          void pump();
        });
    }
  } finally {
    state.pumping = false;
  }
}

async function claimTask(taskId: string): Promise<Task | null> {
  const db = await getDb();
  const claimed = await db
    .update(tasks)
    .set({
      status: 'planning',
      lockedBy: INSTANCE_ID,
      lockedAt: new Date(),
      startedAt: new Date(),
      finishedAt: null,
      error: '',
      progress: 0,
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.status, 'queued')))
    .returning();
  return claimed[0] || null;
}

async function ensureThread(task: Task): Promise<string> {
  if (task.threadId) return task.threadId;
  const db = await getDb();
  const threadId = newId('thr');
  await db.insert(threads).values({
    id: threadId,
    orgId: task.orgId,
    userId: task.createdBy || '',
    expertId: task.expertId,
    title: task.title,
    mode: 'agent',
    source: 'task',
  });
  await db.update(tasks).set({ threadId, updatedAt: new Date() }).where(eq(tasks.id, task.id));
  return threadId;
}

async function ensureUserMessage(task: Task, threadId: string): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.role, 'user')))
    .limit(1);
  if (existing.length) return;
  await db.insert(messages).values({
    id: newId('msg'),
    orgId: task.orgId,
    threadId,
    role: 'user',
    parts: [{ type: 'text', text: `任务目标：${task.goal || task.title}` }],
    content: task.goal || task.title,
    status: 'completed',
  });
}

function taskEventFromRuntime(task: Task): (event: RuntimeEvent) => Promise<void> | void {
  return (event) => {
    if (!task.id) return;
    switch (event.type) {
      case 'tool_start':
        return appendTaskEvent(task.orgId, task.id, 'tool.start', {
          id: event.id,
          name: event.name,
        });
      case 'tool_result':
        return appendTaskEvent(task.orgId, task.id, 'tool.result', {
          id: event.id,
          name: event.name,
          status: event.status,
          summary: event.summary,
          durationMs: event.durationMs,
        });
      case 'approval':
        return appendTaskEvent(task.orgId, task.id, 'task.approval', {
          approvalId: event.approval.id,
          toolName: event.approval.toolName,
          risk: event.approval.risk,
        });
      case 'artifact':
        return appendTaskEvent(task.orgId, task.id, 'task.artifact', {
          artifactId: event.artifact.id,
          name: event.artifact.name,
        });
      case 'error':
        return appendTaskEvent(task.orgId, task.id, 'task.error', { message: event.message });
      case 'status':
        return appendTaskEvent(task.orgId, task.id, 'task.status', { status: event.status });
      default:
        return;
    }
  };
}

async function finalizeTask(task: Task, outcome: RunOutcome): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const nextRun = computeNextRun(task);
  const latest = await db.select().from(tasks).where(eq(tasks.id, task.id)).limit(1);
  const current = latest[0];
  if (current && current.status === 'completed' && outcome.status === 'completed') {
    // complete_task 已落库，补齐进度与调度
    await db
      .update(tasks)
      .set({
        progress: 100,
        finishedAt: now,
        nextRunAt: nextRun,
        lockedBy: null,
        updatedAt: now,
      })
      .where(eq(tasks.id, task.id));
    return;
  }

  let status = 'failed';
  if (outcome.status === 'completed') status = 'completed';
  else if (outcome.status === 'awaiting_approval') status = 'waiting_approval';
  else if (outcome.status === 'cancelled') status = 'cancelled';

  await db
    .update(tasks)
    .set({
      status,
      progress: status === 'completed' ? 100 : undefined,
      finishedAt: status === 'completed' || status === 'failed' || status === 'cancelled' ? now : null,
      error: outcome.error || '',
      resultSummary:
        status === 'completed' ? outcome.content.slice(0, 1500) : current?.resultSummary || '',
      nextRunAt: nextRun,
      lockedBy: null,
      updatedAt: now,
    })
    .where(eq(tasks.id, task.id));

  if (status === 'completed') {
    const { taskSteps } = await import('@/server/db/schema');
    await db
      .update(taskSteps)
      .set({ status: 'done', updatedAt: now })
      .where(eq(taskSteps.taskId, task.id));
  }

  await appendTaskEvent(task.orgId, task.id, `task.${status}`, {
    error: outcome.error || '',
    summary: status === 'completed' ? outcome.content.slice(0, 300) : '',
  });
}

function computeNextRun(task: Task): Date | null {
  const schedule = task.schedule;
  if (!schedule?.enabled || !schedule.cron) return null;
  return nextCronTime(schedule.cron, new Date(), schedule.tzOffsetMinutes || 0);
}

async function executeTask(taskId: string, opts: { resumeMessageId?: string } = {}): Promise<void> {
  let task: Task | null = null;
  if (opts.resumeMessageId) {
    const db0 = await getDb();
    const rows = await db0.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    task = rows[0] || null;
  } else {
    task = await claimTask(taskId);
  }
  if (!task) return;
  const db = await getDb();
  const threadId = await ensureThread(task);
  await ensureUserMessage(task, threadId);

  let messageId = opts.resumeMessageId;
  if (!messageId) {
    messageId = newId('msg');
    await db.insert(messages).values({
      id: messageId,
      orgId: task.orgId,
      threadId,
      role: 'assistant',
      parts: [],
      content: '',
      status: 'streaming',
    });
  }

  await db
    .update(tasks)
    .set({
      status: 'running',
      lastRunAt: new Date(),
      runCount: sql`${tasks.runCount} + 1`,
      lockedBy: INSTANCE_ID,
      lockedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));
  await appendTaskEvent(task.orgId, task.id, 'task.running', { threadId });

  const controller = new AbortController();
  state.controllers.set(task.id, controller);

  try {
    const outcome = await runAgent({
      orgId: task.orgId,
      userId: task.createdBy || '',
      threadId,
      messageId,
      mode: 'task',
      taskId: task.id,
      signal: controller.signal,
      emit: taskEventFromRuntime(task),
      resume: Boolean(opts.resumeMessageId),
    });
    await finalizeTask(task, outcome);
  } catch (err) {
    const message = err instanceof Error ? err.message : '任务执行失败';
    await db
      .update(tasks)
      .set({
        status: 'failed',
        error: message.slice(0, 1000),
        finishedAt: new Date(),
        lockedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id));
    await appendTaskEvent(task.orgId, task.id, 'task.failed', { error: message });
  } finally {
    state.controllers.delete(task.id);
  }
}

export async function resumeTask(taskId: string): Promise<void> {
  const db = await getDb();
  const claimed = await db
    .update(tasks)
    .set({ status: 'running', lockedBy: INSTANCE_ID, lockedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.status, 'waiting_approval')))
    .returning();
  const task = claimed[0];
  if (!task) return;
  if (!task.threadId) return;
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.threadId, task.threadId), eq(messages.role, 'assistant')))
    .orderBy(asc(messages.createdAt));
  const target = [...rows].reverse().find((m) => m.status === 'awaiting_approval');
  if (!target) return;
  state.active += 1;
  try {
    await executeTask(taskId, { resumeMessageId: target.id });
  } finally {
    state.active -= 1;
    void pump();
  }
}

export async function cancelTask(taskId: string, orgId: string): Promise<boolean> {
  const db = await getDb();
  const controller = state.controllers.get(taskId);
  controller?.abort();
  const updated = await db
    .update(tasks)
    .set({
      status: 'cancelled',
      finishedAt: new Date(),
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.orgId, orgId),
        inArray(tasks.status, ['queued', 'planning', 'running', 'waiting_approval']),
      ),
    )
    .returning({ id: tasks.id });
  if (updated.length) {
    await appendTaskEvent(orgId, taskId, 'task.cancelled', {});
    return true;
  }
  return false;
}

export async function retryTask(taskId: string, orgId: string): Promise<boolean> {
  const db = await getDb();
  const updated = await db
    .update(tasks)
    .set({
      status: 'queued',
      progress: 0,
      error: '',
      finishedAt: null,
      lockedBy: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.orgId, orgId),
        inArray(tasks.status, ['failed', 'cancelled', 'completed']),
      ),
    )
    .returning({ id: tasks.id });
  if (!updated.length) return false;
  await appendTaskEvent(orgId, taskId, 'task.retry', {});
  enqueueTask(taskId);
  return true;
}

/** 调度器 tick：到点的定时任务入队 */
export async function tickScheduler(): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const due = await db
    .select()
    .from(tasks)
    .where(
      and(
        isNotNull(tasks.nextRunAt),
        lte(tasks.nextRunAt, now),
        inArray(tasks.status, ['completed', 'failed', 'cancelled']),
      ),
    )
    .limit(20);

  for (const task of due) {
    const schedule = task.schedule;
    if (!schedule?.enabled || !schedule.cron) continue;
    const next = nextCronTime(schedule.cron, now, schedule.tzOffsetMinutes || 0);
    const updated = await db
      .update(tasks)
      .set({
        status: 'queued',
        nextRunAt: next,
        progress: 0,
        error: '',
        finishedAt: null,
        startedAt: null,
        updatedAt: now,
      })
      .where(and(eq(tasks.id, task.id), lte(tasks.nextRunAt, now)))
      .returning({ id: tasks.id });
    if (updated.length) {
      await appendTaskEvent(task.orgId, task.id, 'task.scheduled', {
        nextRunAt: next?.toISOString() || null,
      });
      enqueueTask(task.id);
    }
  }
}

async function recoverStale(): Promise<void> {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const stale = await db
    .update(tasks)
    .set({ status: 'queued', lockedBy: null, lockedAt: null, updatedAt: new Date() })
    .where(
      and(
        inArray(tasks.status, ['running', 'planning']),
        lt(tasks.lockedAt, cutoff),
      ),
    )
    .returning({ id: tasks.id });
  if (stale.length) {
    console.warn(`[cuter] 恢复 ${stale.length} 个中断任务`);
    for (const row of stale) enqueueTask(row.id);
  }
}

export async function enqueueQueuedTasks(): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.status, 'queued'))
    .limit(10);
  for (const row of rows) enqueueTask(row.id);
}

export function ensureScheduler(force = false): void {
  if (state.schedulerStarted) return;
  state.schedulerStarted = true;
  if (!force && !env.INPROCESS_WORKER) return;
  setTimeout(() => {
    void recoverStale().catch((err) => console.error('[cuter] 恢复任务失败', err));
    void enqueueQueuedTasks().catch(() => undefined);
  }, 1500);
  setInterval(() => {
    void tickScheduler().catch((err) => console.error('[cuter] 调度器异常', err));
  }, 30_000);
  setInterval(() => {
    void enqueueQueuedTasks().catch(() => undefined);
  }, 60_000);
  console.log('[cuter] 任务调度器已启动（进程内执行器）');
}

export function runnerStats() {
  return {
    active: state.active,
    queued: state.queue.size,
    running: state.controllers.size,
    schedulerStarted: state.schedulerStarted,
  };
}

export { parseCron };
