import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import {
  expertConnectors,
  expertKnowledgeBases,
  expertSkills,
  experts,
} from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import {
  ExpertInput,
  assertExpertEditable,
  canViewExpert,
  expertBindings,
  syncBindings,
} from '@/server/experts/service';
import { audit } from '@/server/audit';

async function load(orgId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(experts)
    .where(and(eq(experts.orgId, orgId), eq(experts.id, id)))
    .limit(1);
  const expert = rows[0];
  if (!expert) throw new ApiError(404, '专家不存在');
  return expert;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const expert = await load(auth.org.id, id);
    if (!canViewExpert(auth, expert)) throw new ApiError(403, '无权查看该专家');
    const bindings = await expertBindings(auth.org.id, id);
    return json({ expert, bindings });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const expert = await load(auth.org.id, id);
    assertExpertEditable(auth, expert);
    const input = ExpertInput.partial().parse(await readJson(req));
    const db = await getDb();
    const patch: Partial<typeof experts.$inferInsert> = {
      updatedAt: new Date(),
      version: expert.version + 1,
    };
    for (const key of [
      'name',
      'description',
      'icon',
      'accent',
      'category',
      'systemPrompt',
      'modelId',
      'temperature',
      'maxSteps',
      'toolPolicy',
      'defaultMode',
      'visibility',
    ] as const) {
      if (input[key] !== undefined) (patch as Record<string, unknown>)[key] = input[key];
    }
    if (input.providerId !== undefined) patch.providerId = input.providerId || null;
    await db.update(experts).set(patch).where(eq(experts.id, id));
    await syncBindings(auth.org.id, id, input);
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'expert.update',
      { type: 'expert', id },
      { name: input.name || expert.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const expert = await load(auth.org.id, id);
    assertExpertEditable(auth, expert);
    const db = await getDb();
    await db.delete(expertSkills).where(eq(expertSkills.expertId, id));
    await db.delete(expertKnowledgeBases).where(eq(expertKnowledgeBases.expertId, id));
    await db.delete(expertConnectors).where(eq(expertConnectors.expertId, id));
    await db.delete(experts).where(eq(experts.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'expert.delete',
      { type: 'expert', id },
      { name: expert.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
