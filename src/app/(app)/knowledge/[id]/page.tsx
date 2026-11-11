import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { documents, knowledgeBases, modelProviders } from '@/server/db/schema';
import { KnowledgeDetail } from '@/components/knowledge/knowledge-detail';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select({ name: knowledgeBases.name })
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.orgId, auth.org.id), eq(knowledgeBases.id, id)))
    .limit(1);
  return { title: rows[0]?.name || '知识库' };
}

export default async function KnowledgeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select()
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.orgId, auth.org.id), eq(knowledgeBases.id, id)))
    .limit(1);
  const base = rows[0];
  if (!base) notFound();

  const [docs, providers] = await Promise.all([
    db
      .select()
      .from(documents)
      .where(and(eq(documents.orgId, auth.org.id), eq(documents.knowledgeBaseId, id)))
      .orderBy(asc(documents.createdAt)),
    db
      .select({
        id: modelProviders.id,
        name: modelProviders.name,
        embeddingModel: modelProviders.embeddingModel,
        kind: modelProviders.kind,
      })
      .from(modelProviders)
      .where(eq(modelProviders.orgId, auth.org.id))
      .orderBy(asc(modelProviders.createdAt)),
  ]);

  return (
    <KnowledgeDetail
      canManage={auth.role !== 'viewer'}
      base={{
        id: base.id,
        name: base.name,
        description: base.description,
        chunkSize: base.chunkSize,
        chunkOverlap: base.chunkOverlap,
        embeddingProviderId: base.embeddingProviderId,
        embeddingModel: base.embeddingModel,
        docCount: base.docCount,
        chunkCount: base.chunkCount,
        updatedAt: base.updatedAt.toISOString(),
      }}
      documents={docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        mime: doc.mime,
        size: doc.size,
        status: doc.status,
        error: doc.error,
        charCount: doc.charCount,
        chunkCount: doc.chunkCount,
        createdAt: doc.createdAt.toISOString(),
      }))}
      providers={providers}
    />
  );
}
