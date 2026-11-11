import { and, asc, eq, or } from 'drizzle-orm';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import {
  expertConnectors,
  expertKnowledgeBases,
  expertSkills,
  experts,
} from '@/server/db/schema';
import { ExpertGallery } from '@/components/experts/expert-gallery';

export const dynamic = 'force-dynamic';
export const metadata = { title: '专家' };

export default async function ExpertsPage() {
  const auth = await requirePageAuth();
  const db = await getDb();
  const rows = await db
    .select()
    .from(experts)
    .where(
      and(
        eq(experts.orgId, auth.org.id),
        or(
          eq(experts.visibility, 'public'),
          eq(experts.visibility, 'team'),
          eq(experts.createdBy, auth.user.id),
        ),
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

  const count = (list: Array<{ id: string }>, id: string) => list.filter((item) => item.id === id).length;

  return (
    <ExpertGallery
      canManage={auth.role === 'owner' || auth.role === 'admin' || auth.role === 'member'}
      experts={rows.map((expert) => ({
        id: expert.id,
        name: expert.name,
        description: expert.description,
        icon: expert.icon,
        accent: expert.accent,
        category: expert.category,
        visibility: expert.visibility,
        usageCount: expert.usageCount,
        updatedAt: expert.updatedAt.toISOString(),
        skillCount: count(skillRows, expert.id),
        kbCount: count(kbRows, expert.id),
        connectorCount: count(connectorRows, expert.id),
      }))}
    />
  );
}
