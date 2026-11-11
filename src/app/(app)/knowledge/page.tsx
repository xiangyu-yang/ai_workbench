import { asc, eq } from 'drizzle-orm';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { knowledgeBases } from '@/server/db/schema';
import { KnowledgeGallery } from '@/components/knowledge/knowledge-gallery';

export const dynamic = 'force-dynamic';
export const metadata = { title: '知识库' };

export default async function KnowledgePage() {
  const auth = await requirePageAuth();
  const db = await getDb();
  const rows = await db
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.orgId, auth.org.id))
    .orderBy(asc(knowledgeBases.createdAt));

  return (
    <KnowledgeGallery
      canManage={auth.role !== 'viewer'}
      bases={rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        docCount: row.docCount,
        chunkCount: row.chunkCount,
        chunkSize: row.chunkSize,
        embeddingModel: row.embeddingModel,
        updatedAt: row.updatedAt.toISOString(),
      }))}
    />
  );
}
