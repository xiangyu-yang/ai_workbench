import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { apps, experts } from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

const PatchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  category: z.string().trim().max(40).optional(),
  icon: z.string().max(40).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  type: z.enum(['internal', 'external']).optional(),
  url: z.string().trim().max(1000).optional(),
  expertId: z.string().max(80).nullable().optional(),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().min(-1000).max(1000).optional(),
});

async function load(orgId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.orgId, orgId), eq(apps.id, id)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, '应用不存在');
  return rows[0];
}

function validateUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
  } catch {
    throw new ApiError(422, '请输入有效的 http(s) 地址');
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const app = await load(auth.org.id, id);
    const input = PatchBody.parse(await readJson(req));
    const nextType = input.type || app.type;
    const nextUrl = input.url !== undefined ? input.url : app.url;
    const nextExpertId =
      input.expertId !== undefined ? input.expertId : app.expertId;
    if (nextType === 'external' && !nextUrl) throw new ApiError(422, '外部应用需要填写访问地址');
    if (nextType === 'external') validateUrl(nextUrl);
    if (nextType === 'internal' && !nextExpertId) throw new ApiError(422, '内部应用需要绑定专家');
    if (nextExpertId) {
      const db = await getDb();
      const owned = await db
        .select({ id: experts.id })
        .from(experts)
        .where(and(eq(experts.orgId, auth.org.id), eq(experts.id, nextExpertId)))
        .limit(1);
      if (!owned[0]) throw new ApiError(422, '绑定的专家不存在或不属于当前组织');
    }
    const db = await getDb();
    await db
      .update(apps)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.accent !== undefined ? { accent: input.accent } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.url !== undefined ? { url: nextType === 'external' ? input.url : '' } : {}),
        ...(input.expertId !== undefined
          ? { expertId: nextType === 'internal' ? input.expertId : null }
          : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        updatedAt: new Date(),
      })
      .where(eq(apps.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'app.update',
      { type: 'app', id },
      { name: input.name || app.name },
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
    const app = await load(auth.org.id, id);
    const db = await getDb();
    await db.delete(apps).where(eq(apps.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'app.delete',
      { type: 'app', id },
      { name: app.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
