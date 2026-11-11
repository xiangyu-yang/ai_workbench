import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { taskEvents, taskSteps, tasks } from '@/server/db/schema';
import { newId } from '@/server/ids';

const globalChains = globalThis as unknown as { __cuter_event_chains?: Map<string, Promise<void>> };
const chains = (globalChains.__cuter_event_chains ||= new Map<string, Promise<void>>());

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint|23505/i.test(message);
}

async function writeEvent(
  orgId: string,
  taskId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  const last = await db
    .select({ seq: taskEvents.seq })
    .from(taskEvents)
    .where(eq(taskEvents.taskId, taskId))
    .orderBy(desc(taskEvents.seq))
    .limit(1);
  const seq = (last[0]?.seq || 0) + 1;
  await db.insert(taskEvents).values({
    id: newId('evt'),
    orgId,
    taskId,
    seq,
    type,
    payload,
  });
}

/**
 * 任务事件按 taskId 串行写入，并对唯一键冲突做有限重试，
 * 避免 SSE 推送与工具直写并发时丢失事件。
 */
export function appendTaskEvent(
  orgId: string,
  taskId: string,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const key = `${orgId}:${taskId}`;
  const previous = chains.get(key) || Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          await writeEvent(orgId, taskId, type, payload);
          return;
        } catch (err) {
          lastError = err;
          if (!isUniqueViolation(err) || attempt === 3) break;
          await new Promise((resolve) => setTimeout(resolve, 12 * (attempt + 1)));
        }
      }
      throw lastError;
    });

  chains.set(key, current);
  void current
    .catch(() => undefined)
    .finally(() => {
      if (chains.get(key) === current) chains.delete(key);
    });
  return current;
}

export async function setTaskStatus(
  orgId: string,
  taskId: string,
  status: string,
  patch: Partial<typeof tasks.$inferInsert> = {},
): Promise<void> {
  const db = await getDb();
  await db
    .update(tasks)
    .set({ status, updatedAt: new Date(), ...patch })
    .where(eq(tasks.id, taskId));
  await appendTaskEvent(orgId, taskId, 'task.status', { status });
}

export async function refreshTaskProgress(orgId: string, taskId: string): Promise<number> {
  const db = await getDb();
  const steps = await db.select().from(taskSteps).where(eq(taskSteps.taskId, taskId));
  if (!steps.length) return 0;
  const done = steps.filter((s) => s.status === 'done').length;
  const running = steps.some((s) => s.status === 'running') ? 0.5 : 0;
  const progress = Math.min(99, Math.round(((done + running) / steps.length) * 100));
  await db
    .update(tasks)
    .set({ progress, updatedAt: new Date() })
    .where(eq(tasks.id, taskId));
  return progress;
}
