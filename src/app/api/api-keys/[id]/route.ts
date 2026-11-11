import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { apiKeys } from '@/server/db/schema';
import { ApiError, assertSameOrigin, errorResponse, json, requireApi } from '@/server/http';
import { audit } from '@/server/audit';

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.orgId, auth.org.id)))
      .returning({ id: apiKeys.id, name: apiKeys.name });
    if (!rows.length) throw new ApiError(404, 'API Key 不存在');
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'api_key.revoke',
      { type: 'api_key', id },
      { name: rows[0].name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
