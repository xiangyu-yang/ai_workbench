import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { runs, usageDaily } from '@/server/db/schema';
import { errorResponse, json, requireApi } from '@/server/http';
import { monthStart, today } from '@/server/usage';

export async function GET() {
  try {
    const auth = await requireApi('viewer');
    const db = await getDb();
    const since = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const rows = await db
      .select()
      .from(usageDaily)
      .where(and(eq(usageDaily.orgId, auth.org.id), gte(usageDaily.day, since)));

    const byDay = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number; runs: number }>();
    const byModel = new Map<string, { inputTokens: number; outputTokens: number; costUsd: number; runs: number }>();
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let runCount = 0;

    for (const row of rows) {
      const day = byDay.get(row.day) || { inputTokens: 0, outputTokens: 0, costUsd: 0, runs: 0 };
      day.inputTokens += row.inputTokens;
      day.outputTokens += row.outputTokens;
      day.costUsd += row.costUsd;
      day.runs += row.runs;
      byDay.set(row.day, day);

      const model = byModel.get(row.model) || {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        runs: 0,
      };
      model.inputTokens += row.inputTokens;
      model.outputTokens += row.outputTokens;
      model.costUsd += row.costUsd;
      model.runs += row.runs;
      byModel.set(row.model, model);

      inputTokens += row.inputTokens;
      outputTokens += row.outputTokens;
      costUsd += row.costUsd;
      runCount += row.runs;
    }

    const monthRows = await db
      .select()
      .from(usageDaily)
      .where(and(eq(usageDaily.orgId, auth.org.id), gte(usageDaily.day, monthStart())));
    const monthTokens = monthRows.reduce((acc, row) => acc + row.inputTokens + row.outputTokens, 0);

    const runRows = await db
      .select({ createdAt: runs.createdAt, latencyMs: runs.latencyMs, status: runs.status })
      .from(runs)
      .where(and(eq(runs.orgId, auth.org.id), gte(runs.createdAt, new Date(since))))
      .limit(500);
    const okRuns = runRows.filter((r) => r.status === 'ok');
    const avgLatency = okRuns.length
      ? Math.round(okRuns.reduce((acc, r) => acc + r.latencyMs, 0) / okRuns.length)
      : 0;

    return json({
      range: { from: since, to: today() },
      totals: { inputTokens, outputTokens, costUsd, runCount, avgLatencyMs: avgLatency },
      month: { tokens: monthTokens, quota: auth.org.tokenQuotaMonthly },
      daily: [...byDay.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([day, value]) => ({ day, ...value })),
      models: [...byModel.entries()].map(([model, value]) => ({ model, ...value })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
