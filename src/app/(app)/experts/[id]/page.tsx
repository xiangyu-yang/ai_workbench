import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import {
  connectors,
  experts,
  knowledgeBases,
  modelProviders,
  skills,
} from '@/server/db/schema';
import { canViewExpert, expertBindings } from '@/server/experts/service';
import { ExpertEditor } from '@/components/experts/expert-editor';
import { isAdmin } from '@/server/auth/rbac';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select({ name: experts.name })
    .from(experts)
    .where(and(eq(experts.orgId, auth.org.id), eq(experts.id, id)))
    .limit(1);
  return { title: rows[0]?.name || '专家' };
}

export default async function ExpertDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select()
    .from(experts)
    .where(and(eq(experts.orgId, auth.org.id), eq(experts.id, id)))
    .limit(1);
  const expert = rows[0];
  if (!expert || !canViewExpert(auth, expert)) notFound();

  const [bindings, skillRows, kbRows, connectorRows, providerRows] = await Promise.all([
    expertBindings(auth.org.id, id),
    db
      .select({
        id: skills.id,
        name: skills.name,
        description: skills.description,
        type: skills.type,
        category: skills.category,
      })
      .from(skills)
      .where(eq(skills.orgId, auth.org.id))
      .orderBy(asc(skills.createdAt)),
    db
      .select({ id: knowledgeBases.id, name: knowledgeBases.name, docCount: knowledgeBases.docCount })
      .from(knowledgeBases)
      .where(eq(knowledgeBases.orgId, auth.org.id))
      .orderBy(asc(knowledgeBases.createdAt)),
    db
      .select({ id: connectors.id, name: connectors.name, toolCount: connectors.toolCount })
      .from(connectors)
      .where(eq(connectors.orgId, auth.org.id))
      .orderBy(asc(connectors.createdAt)),
    db
      .select()
      .from(modelProviders)
      .where(eq(modelProviders.orgId, auth.org.id))
      .orderBy(asc(modelProviders.createdAt)),
  ]);

  const canEdit = isAdmin(auth.role) || expert.createdBy === auth.user.id;

  return (
    <ExpertEditor
      expert={{
        id: expert.id,
        name: expert.name,
        description: expert.description,
        icon: expert.icon,
        accent: expert.accent,
        category: expert.category,
        systemPrompt: expert.systemPrompt,
        providerId: expert.providerId,
        modelId: expert.modelId,
        temperature: expert.temperature,
        maxSteps: expert.maxSteps,
        toolPolicy: expert.toolPolicy,
        defaultMode: expert.defaultMode,
        visibility: expert.visibility,
        version: expert.version,
        usageCount: expert.usageCount,
        updatedAt: expert.updatedAt.toISOString(),
      }}
      bindings={{
        skillIds: bindings.skills.map((item) => item.id),
        kbIds: bindings.knowledgeBases.map((item) => item.id),
        connectorIds: bindings.connectors.map((item) => item.id),
      }}
      skills={skillRows}
      knowledgeBases={kbRows}
      connectors={connectorRows}
      providers={providerRows.map((provider) => ({
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        models: provider.models.map((model) => model.id),
      }))}
      canEdit={canEdit}
    />
  );
}
