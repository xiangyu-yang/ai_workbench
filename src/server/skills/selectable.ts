import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { skills, type Role } from '@/server/db/schema';
import { ApiError } from '@/server/http';
import { isAdmin } from '@/server/auth/rbac';

export type SelectableSkill = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  version: number;
  visibility: string;
  createdBy: string | null;
};

export async function listSelectableSkills(
  orgId: string,
  userId: string,
  role: Role,
): Promise<SelectableSkill[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: skills.id,
      name: skills.name,
      description: skills.description,
      category: skills.category,
      icon: skills.icon,
      version: skills.version,
      visibility: skills.visibility,
      createdBy: skills.createdBy,
    })
    .from(skills)
    .where(and(eq(skills.orgId, orgId), eq(skills.status, 'published')))
    .orderBy(asc(skills.category), asc(skills.name));
  return rows.filter(
    (row) => isAdmin(role) || row.visibility === 'public' || row.createdBy === userId,
  );
}

export async function assertSelectableSkills(
  orgId: string,
  userId: string,
  role: Role,
  ids: string[] | null | undefined,
): Promise<string[] | null | undefined> {
  if (ids === null || ids === undefined) return ids;
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 5);
  if (!unique.length) return [];
  const db = await getDb();
  const rows = await db
    .select({
      id: skills.id,
      visibility: skills.visibility,
      createdBy: skills.createdBy,
    })
    .from(skills)
    .where(
      and(
        eq(skills.orgId, orgId),
        eq(skills.status, 'published'),
        inArray(skills.id, unique),
      ),
    );
  const allowed = new Map(
    rows
      .filter((row) => isAdmin(role) || row.visibility === 'public' || row.createdBy === userId)
      .map((row) => [row.id, true]),
  );
  const missing = unique.filter((id) => !allowed.has(id));
  if (missing.length) throw new ApiError(400, '部分技能不存在、未发布或无权使用', 'invalid_skills');
  return unique;
}
