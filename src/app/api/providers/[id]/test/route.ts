import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { modelProviders } from '@/server/db/schema';
import { listModels, toProviderConfig } from '@/server/llm/gateway';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  requireApi,
} from '@/server/http';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(modelProviders)
      .where(and(eq(modelProviders.orgId, auth.org.id), eq(modelProviders.id, id)))
      .limit(1);
    if (!rows[0]) throw new ApiError(404, '模型供应商不存在');
    const provider = toProviderConfig(rows[0]);
    const started = Date.now();
    const models = await listModels(provider);
    return json({ ok: true, models, latencyMs: Date.now() - started });
  } catch (err) {
    return errorResponse(err);
  }
}
