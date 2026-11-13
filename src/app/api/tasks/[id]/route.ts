import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import {
  approvals,
  artifacts,
  experts,
  messages,
  taskEvents,
  taskSteps,
  tasks,
  threads,
} from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { nextCronTime, validateCron } from '@/server/tasks/cron';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select({ task: tasks, expert: experts })
      .from(tasks)
      .leftJoin(experts, eq(experts.id, tasks.expertId))
      .where(and(eq(tasks.orgId, auth.org.id), eq(tasks.id, id)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new ApiError(404, '任务不存在');

    const [stepRows, events, artifactRows, approvalRows] = await Promise.all([
      db.select().from(taskSteps).where(eq(taskSteps.taskId, id)).orderBy(asc(taskSteps.ordinal)),
      db.select().from(taskEvents).where(eq(taskEvents.taskId, id)).orderBy(asc(taskEvents.seq)),
      db.select().from(artifacts).where(eq(artifacts.taskId, id)),
      db.select().from(approvals).where(eq(approvals.taskId, id)).orderBy(asc(approvals.createdAt)),
    ]);

    let steps = stepRows;
    if (row.task.status === 'completed' && steps.some((step) => step.status !== 'done')) {
      const now = new Date();
      await db
        .update(taskSteps)
        .set({ status: 'done', updatedAt: now })
        .where(eq(taskSteps.taskId, id));
      steps = steps.map((step) => ({ ...step, status: 'done' as const, updatedAt: now }));
    }

    let msgs: Array<typeof messages.$inferSelect> = [];
    if (row.task.threadId) {
      msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.threadId, row.task.threadId))
        .orderBy(asc(messages.createdAt))
        .limit(40);
    }

    return json({
      task: row.task,
      expert: row.expert
        ? {
            id: row.expert.id,
            name: row.expert.name,
            icon: row.expert.icon,
            accent: row.expert.accent,
          }
        : null,
      steps,
      events,
      artifacts: artifactRows,
      approvals: approvalRows,
      messages: msgs,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

const PatchBody = z.object({
  schedule: z
    .object({
      enabled: z.boolean(),
      cron: z.string().max(120).optional(),
      tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
    })
    .optional(),
});

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.orgId, auth.org.id), eq(tasks.id, id)))
      .limit(1);
    const task = rows[0];
    if (!task) throw new ApiError(404, '任务不存在');
    if (['queued', 'planning', 'running', 'waiting_approval'].includes(task.status)) {
      throw new ApiError(409, '任务正在执行或等待审批，请先取消', 'task_busy');
    }

    await db.delete(taskSteps).where(eq(taskSteps.taskId, id));
    await db.delete(taskEvents).where(eq(taskEvents.taskId, id));
    await db.delete(approvals).where(eq(approvals.taskId, id));
    await db.delete(artifacts).where(eq(artifacts.taskId, id));
    if (task.threadId) {
      const threadRows = await db
        .select({ source: threads.source })
        .from(threads)
        .where(and(eq(threads.orgId, auth.org.id), eq(threads.id, task.threadId)))
        .limit(1);
      await db.delete(messages).where(eq(messages.threadId, task.threadId));
      if (threadRows[0]?.source === 'task') {
        await db.delete(artifacts).where(eq(artifacts.threadId, task.threadId));
        await db.delete(threads).where(eq(threads.id, task.threadId));
      }
    }
    await db.delete(tasks).where(eq(tasks.id, id));
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const input = PatchBody.parse(await readJson(req));
    const db = await getDb();
    const rows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.orgId, auth.org.id), eq(tasks.id, id)))
      .limit(1);
    const task = rows[0];
    if (!task) throw new ApiError(404, '任务不存在');

    if (input.schedule) {
      let schedule = { enabled: false } as typeof task.schedule;
      if (input.schedule.enabled) {
        if (!input.schedule.cron) throw new ApiError(422, '定时任务需要 cron 表达式');
        const error = validateCron(input.schedule.cron);
        if (error) throw new ApiError(422, error);
        const next = nextCronTime(
          input.schedule.cron,
          new Date(),
          input.schedule.tzOffsetMinutes || 0,
        );
        schedule = {
          enabled: true,
          cron: input.schedule.cron,
          tzOffsetMinutes: input.schedule.tzOffsetMinutes || 0,
          nextRunAt: next?.toISOString() || null,
        };
      }
      await db
        .update(tasks)
        .set({
          schedule,
          nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, id));
    }
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
