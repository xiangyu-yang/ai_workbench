import { sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { env, VERSION } from '@/server/env';
import { storageBackend } from '@/server/storage';
import { webSearchProvider } from '@/server/agent/tools/builtin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({
      status: 'ok',
      version: VERSION,
      database: env.DATABASE_URL ? 'postgres' : 'pglite',
      storage: storageBackend(),
      search: webSearchProvider(),
      demoMode: env.DEMO_MODE,
      latencyMs: Date.now() - started,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      {
        status: 'degraded',
        error: (err as Error).message,
        version: VERSION,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
