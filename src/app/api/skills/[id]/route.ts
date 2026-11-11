import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { skillFiles, skillVersions, skills } from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { parseManifest } from '@/server/skills/validation';
import {
  composeSkillMarkdown,
  ensureSkillPackage,
  loadSkillFiles,
  mimeOf,
  parseSkillMarkdown,
  toPackageFile,
  validateSkillPackage,
} from '@/server/skills/package';
import { audit } from '@/server/audit';
import { isAdmin } from '@/server/auth/rbac';

const PatchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  type: z.enum(['instruction', 'http']).optional(),
  icon: z.string().max(40).optional(),
  category: z.string().max(40).optional(),
  instructions: z.string().max(30_000).optional(),
  manifest: z.unknown().optional(),
  visibility: z.enum(['private', 'team', 'public']).optional(),
});

async function load(orgId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(skills)
    .where(and(eq(skills.orgId, orgId), eq(skills.id, id)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, '技能不存在');
  return rows[0];
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const skill = await load(auth.org.id, id);
    const [files, versions] = await Promise.all([
      ensureSkillPackage(auth.org.id, skill),
      (await getDb())
        .select({
          version: skillVersions.version,
          createdAt: skillVersions.createdAt,
          createdBy: skillVersions.createdBy,
        })
        .from(skillVersions)
        .where(eq(skillVersions.skillId, id))
        .orderBy(skillVersions.version),
    ]);
    const validation = await validateSkillPackage(auth.org.id, skill, files.map(toPackageFile));
    return json({ skill, files, versions, validation });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const skill = await load(auth.org.id, id);
    if (!isAdmin(auth.role) && skill.createdBy !== auth.user.id) {
      throw new ApiError(403, '只有管理员或创建者可以修改该技能');
    }
    const input = PatchBody.parse(await readJson(req));
    const parsedManifest = input.manifest !== undefined ? parseManifest(input.manifest) : undefined;
    if (input.type === 'http' && parsedManifest && !parsedManifest.tools.length) {
      throw new ApiError(422, 'HTTP 技能至少需要一个工具定义');
    }
    const db = await getDb();
    const manifest =
      parsedManifest !== undefined
        ? {
            ...parsedManifest,
            entry: skill.manifest?.entry || 'SKILL.md',
            fileCount: skill.manifest?.fileCount || 0,
            packageSize: skill.manifest?.packageSize || 0,
            frontmatter: skill.manifest?.frontmatter,
          }
        : undefined;
    let nextInstructions = input.instructions;
    if (
      input.instructions !== undefined ||
      input.name !== undefined ||
      input.description !== undefined ||
      input.category !== undefined
    ) {
      const files = await loadSkillFiles(auth.org.id, id);
      const entry = files.find((file) => file.path === 'SKILL.md');
      if (entry) {
        const parsed = parseSkillMarkdown(entry.content);
        const content = composeSkillMarkdown({
          name: input.name || parsed.frontmatter.name || skill.name,
          description: input.description || parsed.frontmatter.description || skill.description,
          body: input.instructions !== undefined ? input.instructions : parsed.body,
          version: parsed.frontmatter.version,
          license: parsed.frontmatter.license,
          allowedTools: parsed.frontmatter.allowedTools,
          category: input.category || skill.category,
        });
        await db
          .update(skillFiles)
          .set({
            content,
            size: Buffer.byteLength(content, 'utf8'),
            mime: mimeOf('SKILL.md'),
            updatedAt: new Date(),
          })
          .where(eq(skillFiles.id, entry.id));
        if (nextInstructions === undefined) nextInstructions = parsed.body;
      }
    }
    await db
      .update(skills)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(nextInstructions !== undefined ? { instructions: nextInstructions } : {}),
        ...(manifest !== undefined ? { manifest } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        updatedAt: new Date(),
      })
      .where(eq(skills.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'skill.update',
      { type: 'skill', id },
      { name: input.name || skill.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const skill = await load(auth.org.id, id);
    if (!isAdmin(auth.role) && skill.createdBy !== auth.user.id) {
      throw new ApiError(403, '只有管理员或创建者可以删除该技能');
    }
    const db = await getDb();
    const { expertSkills } = await import('@/server/db/schema');
    await db.delete(expertSkills).where(eq(expertSkills.skillId, id));
    await db.delete(skillFiles).where(eq(skillFiles.skillId, id));
    await db.delete(skillVersions).where(eq(skillVersions.skillId, id));
    await db.delete(skills).where(eq(skills.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'skill.delete',
      { type: 'skill', id },
      { name: skill.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
