import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { skillVersions, skills } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { ApiError, assertSameOrigin, errorResponse, json, requireApi } from '@/server/http';
import { audit } from '@/server/audit';
import {
  ensureSkillPackage,
  loadSkillFiles,
  parseSkillMarkdown,
  toPackageFile,
  validateSkillPackage,
} from '@/server/skills/package';
import { isAdmin } from '@/server/auth/rbac';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(skills)
      .where(and(eq(skills.orgId, auth.org.id), eq(skills.id, id)))
      .limit(1);
    const skill = rows[0];
    if (!skill) throw new ApiError(404, '技能不存在');
    if (!isAdmin(auth.role) && skill.createdBy !== auth.user.id) {
      throw new ApiError(403, '只有管理员或创建者可以发布该技能');
    }
    if (skill.type === 'http' && !skill.manifest.tools?.length) {
      throw new ApiError(422, '没有工具定义的 HTTP 技能无法发布');
    }

    await ensureSkillPackage(auth.org.id, skill);
    const rowsFiles = await loadSkillFiles(auth.org.id, id);
    const files = rowsFiles.map(toPackageFile);
    const validation = await validateSkillPackage(auth.org.id, skill, files);
    if (validation.errors.length) {
      throw new ApiError(422, `技能包校验失败：${validation.errors.join('；')}`, 'skill_invalid');
    }

    const existing = await db
      .select({ version: skillVersions.version })
      .from(skillVersions)
      .where(and(eq(skillVersions.orgId, auth.org.id), eq(skillVersions.skillId, id)))
      .orderBy(desc(skillVersions.version))
      .limit(1);
    const version = existing[0]?.version ? existing[0].version + 1 : Math.max(1, skill.version || 1);
    const parsed = parseSkillMarkdown(files.find((file) => file.path === 'SKILL.md')?.content || '');
    await db.insert(skillVersions).values({
      id: newId('skv'),
      orgId: auth.org.id,
      skillId: id,
      version,
      snapshot: {
        name: parsed.frontmatter.name || skill.name,
        description: parsed.frontmatter.description || skill.description,
        type: skill.type,
        instructions: validation.body || skill.instructions,
        manifest: {
          ...skill.manifest,
          entry: 'SKILL.md',
          fileCount: files.length,
          packageSize: files.reduce((sum, file) => sum + file.size, 0),
          frontmatter: parsed.frontmatter,
        },
        frontmatter: parsed.frontmatter,
        entry: 'SKILL.md',
        files,
        publishedAt: new Date().toISOString(),
      },
      createdBy: auth.user.id,
    });
    await db
      .update(skills)
      .set({
        version,
        status: 'published',
        instructions: validation.body || skill.instructions,
        manifest: {
          ...skill.manifest,
          entry: 'SKILL.md',
          fileCount: files.length,
          packageSize: files.reduce((sum, file) => sum + file.size, 0),
          frontmatter: parsed.frontmatter,
        },
        updatedAt: new Date(),
      })
      .where(eq(skills.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'skill.publish',
      { type: 'skill', id },
      { name: skill.name, version, files: files.length },
    );
    return json({ ok: true, version, fileCount: files.length });
  } catch (err) {
    return errorResponse(err);
  }
}
