import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { runs, usageDaily } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { ApiError } from '@/server/http';

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthStart(): string {
  return `${today().slice(0, 7)}-01`;
}

export async function monthlyTokens(orgId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${usageDaily.inputTokens} + ${usageDaily.outputTokens}), 0)`,
    })
    .from(usageDaily)
    .where(and(eq(usageDaily.orgId, orgId), gte(usageDaily.day, monthStart())));
  return Number(rows[0]?.total || 0);
}

export async function assertQuota(orgId: string, quota: number): Promise<void> {
  if (!quota || quota <= 0) return;
  const used = await monthlyTokens(orgId);
  if (used >= quota) {
    throw new ApiError(
      402,
      `本月 token 配额已用尽（${used.toLocaleString()} / ${quota.toLocaleString()}），请联系管理员调整配额`,
      'quota_exceeded',
    );
  }
}

export async function recordUsage(params: {
  orgId: string;
  providerId?: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}): Promise<void> {
  const db = await getDb();
  const day = today();
  try {
    await db
      .insert(usageDaily)
      .values({
        id: newId('usg'),
        orgId: params.orgId,
        day,
        providerId: params.providerId || null,
        model: params.model,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        runs: 1,
        costUsd: params.costUsd,
      })
      .onConflictDoUpdate({
        target: [usageDaily.orgId, usageDaily.day, usageDaily.model],
        set: {
          inputTokens: sql`${usageDaily.inputTokens} + ${params.inputTokens}`,
          outputTokens: sql`${usageDaily.outputTokens} + ${params.outputTokens}`,
          runs: sql`${usageDaily.runs} + 1`,
          costUsd: sql`${usageDaily.costUsd} + ${params.costUsd}`,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error('[cuter] 用量写入失败', err);
  }
}

export async function createRun(params: {
  orgId: string;
  threadId?: string | null;
  messageId?: string | null;
  taskId?: string | null;
  expertId?: string | null;
  providerId?: string | null;
  model: string;
}): Promise<string> {
  const db = await getDb();
  const id = newId('run');
  await db.insert(runs).values({
    id,
    orgId: params.orgId,
    threadId: params.threadId || null,
    messageId: params.messageId || null,
    taskId: params.taskId || null,
    expertId: params.expertId || null,
    providerId: params.providerId || null,
    model: params.model,
    status: 'running',
  });
  return id;
}

export async function finishRun(params: {
  runId: string;
  status: 'ok' | 'error' | 'cancelled' | 'awaiting_approval';
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  steps?: number;
  error?: string;
}): Promise<void> {
  const db = await getDb();
  await db
    .update(runs)
    .set({
      status: params.status,
      inputTokens: params.inputTokens || 0,
      outputTokens: params.outputTokens || 0,
      costUsd: params.costUsd || 0,
      latencyMs: params.latencyMs || 0,
      steps: params.steps || 0,
      error: params.error || '',
      finishedAt: new Date(),
    })
    .where(eq(runs.id, params.runId));
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  inputPrice = 0,
  outputPrice = 0,
): number {
  return (inputTokens / 1_000_000) * inputPrice + (outputTokens / 1_000_000) * outputPrice;
}
