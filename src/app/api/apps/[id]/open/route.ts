import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { apps } from '@/server/db/schema';
import { ApiError, assertSameOrigin, errorResponse, json, requireApi } from '@/server/http';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(apps)
      .where(and(eq(apps.orgId, auth.org.id), eq(apps.id, id), eq(apps.enabled, true)))
      .limit(1);
    const app = rows[0];
    if (!app) throw new ApiError(404, '应用不存在或已停用');
    await db.update(apps).set({ lastOpenedAt: new Date() }).where(eq(apps.id, id));
    return json({
      ok: true,
      target: app.type === 'external' ? app.url : `/chat?expert=${app.expertId || ''}&app=${app.id}`,
      type: app.type,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
