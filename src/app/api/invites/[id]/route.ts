import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { invites } from '@/server/db/schema';
import { ApiError, assertSameOrigin, errorResponse, json, requireApi } from '@/server/http';

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .delete(invites)
      .where(and(eq(invites.id, id), eq(invites.orgId, auth.org.id)))
      .returning({ id: invites.id });
    if (!rows.length) throw new ApiError(404, '邀请不存在');
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
