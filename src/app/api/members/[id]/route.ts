import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { memberships, users } from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

const Body = z.object({ role: z.enum(['owner', 'admin', 'member', 'viewer']) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const input = Body.parse(await readJson(req));
    const db = await getDb();
    const rows = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.id, id), eq(memberships.orgId, auth.org.id)))
      .limit(1);
    const membership = rows[0];
    if (!membership) throw new ApiError(404, '成员不存在');
    if (input.role === 'owner' && auth.role !== 'owner') {
      throw new ApiError(403, '只有所有者可以转让所有权');
    }
    if (membership.role === 'owner' && auth.role !== 'owner') {
      throw new ApiError(403, '只有所有者可以变更所有者角色');
    }
    await db.update(memberships).set({ role: input.role }).where(eq(memberships.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'member.role',
      { type: 'membership', id },
      { from: membership.role, to: input.role },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.id, id), eq(memberships.orgId, auth.org.id)))
      .limit(1);
    const membership = rows[0];
    if (!membership) throw new ApiError(404, '成员不存在');
    if (membership.userId === auth.user.id) throw new ApiError(422, '不能移除自己');
    if (membership.role === 'owner') throw new ApiError(422, '不能移除组织所有者');

    const userRows = await db.select().from(users).where(eq(users.id, membership.userId)).limit(1);
    await db.delete(memberships).where(eq(memberships.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'member.remove',
      { type: 'user', id: membership.userId },
      { email: userRows[0]?.email },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
