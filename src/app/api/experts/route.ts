import { and, asc, eq, or } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import {
  expertConnectors,
  expertKnowledgeBases,
  expertSkills,
  experts,
} from '@/server/db/schema';
import { newId } from '@/server/ids';
import { audit } from '@/server/audit';
import {
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { ExpertInput, syncBindings } from '@/server/experts/service';

export async function GET() {
  try {
    const auth = await requireApi('viewer');
    const db = await getDb();
    const rows = await db
      .select()
      .from(experts)
      .where(
        and(
          eq(experts.orgId, auth.org.id),
          or(eq(experts.visibility, 'public'), eq(experts.visibility, 'team'), eq(experts.createdBy, auth.user.id)),
        ),
      )
      .orderBy(asc(experts.createdAt));

    const [skillRows, kbRows, connectorRows] = await Promise.all([
      db.select({ id: expertSkills.expertId }).from(expertSkills).where(eq(expertSkills.orgId, auth.org.id)),
      db
        .select({ id: expertKnowledgeBases.expertId })
        .from(expertKnowledgeBases)
        .where(eq(expertKnowledgeBases.orgId, auth.org.id)),
      db
        .select({ id: expertConnectors.expertId })
        .from(expertConnectors)
        .where(eq(expertConnectors.orgId, auth.org.id)),
    ]);

    const count = (list: Array<{ id: string }>, id: string) =>
      list.filter((x) => x.id === id).length;

    return json({
      experts: rows.map((row) => ({
        ...row,
        skillCount: count(skillRows, row.id),
        kbCount: count(kbRows, row.id),
        connectorCount: count(connectorRows, row.id),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const input = ExpertInput.parse(await readJson(req));
    const db = await getDb();
    const id = newId('exp');
    await db.insert(experts).values({
      id,
      orgId: auth.org.id,
      name: input.name,
      description: input.description,
      icon: input.icon,
      accent: input.accent,
      category: input.category,
      systemPrompt: input.systemPrompt,
      providerId: input.providerId || null,
      modelId: input.modelId,
      temperature: input.temperature,
      maxSteps: input.maxSteps,
      toolPolicy: input.toolPolicy,
      defaultMode: input.defaultMode,
      visibility: input.visibility,
      createdBy: auth.user.id,
    });
    await syncBindings(auth.org.id, id, input);
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'expert.create',
      { type: 'expert', id },
      { name: input.name },
    );
    return json({ ok: true, id }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
