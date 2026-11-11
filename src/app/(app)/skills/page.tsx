import { asc, eq } from 'drizzle-orm';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { expertSkills, skills } from '@/server/db/schema';
import { SkillGallery } from '@/components/skills/skill-gallery';

export const dynamic = 'force-dynamic';
export const metadata = { title: '技能' };

export default async function SkillsPage() {
  const auth = await requirePageAuth();
  const db = await getDb();
  const [rows, bindings] = await Promise.all([
    db.select().from(skills).where(eq(skills.orgId, auth.org.id)).orderBy(asc(skills.createdAt)),
    db
      .select({ skillId: expertSkills.skillId })
      .from(expertSkills)
      .where(eq(expertSkills.orgId, auth.org.id)),
  ]);

  return (
    <SkillGallery
      canManage={auth.role !== 'viewer'}
      skills={rows.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        type: skill.type,
        icon: skill.icon,
        category: skill.category,
        version: skill.version,
        status: skill.status,
        visibility: skill.visibility,
        toolCount: skill.manifest.tools?.length || 0,
        fileCount: skill.manifest.fileCount || 1,
        expertCount: bindings.filter((binding) => binding.skillId === skill.id).length,
        updatedAt: skill.updatedAt.toISOString(),
      }))}
    />
  );
}
