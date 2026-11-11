import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { VERSION } from '@/server/env';
import { runnerStats } from '@/server/tasks/runner';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const token = process.env.METRICS_TOKEN;
  if (token) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${token}`) {
      return new Response('forbidden', { status: 403 });
    }
  }
  try {
    const db = await getDb();
    const taskRows = await db.execute(
      sql`select status, count(*)::int as count from tasks group by status`,
    );
    const runRows = await db.execute(
      sql`select count(*)::int as count, coalesce(sum(input_tokens + output_tokens),0)::int as tokens from runs where created_at > now() - interval '24 hours'`,
    );
    const tasksByStatus = (taskRows as unknown as { rows?: Array<{ status: string; count: number }> })
      .rows || [];
    const runStats = (
      runRows as unknown as { rows?: Array<{ count: number; tokens: number }> }
    ).rows?.[0] || { count: 0, tokens: 0 };
    const runner = runnerStats();
    const lines = [
      '# HELP cuter_info Build info',
      '# TYPE cuter_info gauge',
      `cuter_info{version="${VERSION}"} 1`,
      '# HELP cuter_uptime_seconds Process uptime',
      '# TYPE cuter_uptime_seconds gauge',
      `cuter_uptime_seconds ${Math.round(process.uptime())}`,
      '# HELP cuter_tasks Number of tasks by status',
      '# TYPE cuter_tasks gauge',
      ...tasksByStatus.map((row) => `cuter_tasks{status="${row.status}"} ${row.count}`),
      '# HELP cuter_runner_active Active in-process task executions',
      '# TYPE cuter_runner_active gauge',
      `cuter_runner_active ${runner.active}`,
      '# HELP cuter_runs_24h Runs in the last 24 hours',
      '# TYPE cuter_runs_24h gauge',
      `cuter_runs_24h ${runStats.count}`,
      '# HELP cuter_tokens_24h Tokens consumed in the last 24 hours',
      '# TYPE cuter_tokens_24h gauge',
      `cuter_tokens_24h ${runStats.tokens}`,
      '',
    ];
    return new Response(lines.join('\n'), {
      headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' },
    });
  } catch (err) {
    return new Response(`# error: ${(err as Error).message}`, { status: 500 });
  }
}
