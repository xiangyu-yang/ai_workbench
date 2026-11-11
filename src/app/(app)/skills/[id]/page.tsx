import { and, asc, desc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { expertSkills, experts, skillVersions, skills } from '@/server/db/schema';
import { SkillStudio } from '@/components/skills/skill-studio';
import {
  ensureSkillPackage,
  loadSkillFiles,
  toPackageFile,
  validateSkillPackage,
} from '@/server/skills/package';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select({ name: skills.name })
    .from(skills)
    .where(and(eq(skills.orgId, auth.org.id), eq(skills.id, id)))
    .limit(1);
  return { title: rows[0]?.name || '技能' };
}

export default async function SkillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select()
    .from(skills)
    .where(and(eq(skills.orgId, auth.org.id), eq(skills.id, id)))
    .limit(1);
  const skill = rows[0];
  if (!skill) notFound();

  const fileRows = await ensureSkillPackage(auth.org.id, skill);
  const files = fileRows.map(toPackageFile);
  const validation = await validateSkillPackage(auth.org.id, skill, files);
  const [versions, boundExperts] = await Promise.all([
    db
      .select({ version: skillVersions.version, createdAt: skillVersions.createdAt })
      .from(skillVersions)
      .where(eq(skillVersions.skillId, id))
      .orderBy(desc(skillVersions.version))
      .limit(10),
    db
      .select({ id: experts.id, name: experts.name })
      .from(expertSkills)
      .innerJoin(experts, eq(experts.id, expertSkills.expertId))
      .where(and(eq(expertSkills.orgId, auth.org.id), eq(expertSkills.skillId, id)))
      .orderBy(asc(experts.name)),
  ]);

  return (
    <SkillStudio
      key={skill.id}
      skill={{
        id: skill.id,
        name: skill.name,
        description: skill.description,
        type: skill.type,
        category: skill.category,
        version: skill.version,
        status: skill.status,
        visibility: skill.visibility,
        updatedAt: skill.updatedAt.toISOString(),
        manifest: skill.manifest,
      }}
      files={files}
      versions={versions.map((version) => ({
        version: version.version,
        createdAt: version.createdAt.toISOString(),
      }))}
      boundExperts={boundExperts}
      validation={{
        errors: validation.errors,
        frontmatter: validation.frontmatter,
        body: validation.body,
      }}
      canManage={auth.role !== 'viewer'}
    />
  );
}
