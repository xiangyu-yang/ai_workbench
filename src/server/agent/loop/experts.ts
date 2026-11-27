import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { expertKnowledgeBases, experts, type Expert } from '@/server/db/schema';

export async function loadExpert(orgId: string, expertId?: string | null): Promise<Expert | null> {
  if (!expertId) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(experts)
    .where(and(eq(experts.orgId, orgId), eq(experts.id, expertId)))
    .limit(1);
  return rows[0] || null;
}

export async function kbIdsOf(orgId: string, expert: Expert | null): Promise<string[]> {
  if (!expert) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: expertKnowledgeBases.knowledgeBaseId })
    .from(expertKnowledgeBases)
    .where(and(eq(expertKnowledgeBases.orgId, orgId), eq(expertKnowledgeBases.expertId, expert.id)));
  return rows.map((row) => row.id);
}
