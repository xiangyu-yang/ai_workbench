import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { skillFiles, skills } from '@/server/db/schema';
import { newId } from '@/server/ids';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';
import { isAdmin } from '@/server/auth/rbac';
import type { Role } from '@/server/db/schema';
import {
  MAX_FILE_BYTES,
  classifyPath,
  isTextFile,
  loadSkillFiles,
  mimeOf,
  normalizePackagePath,
  parseSkillMarkdown,
  summarizePackage,
  toPackageFile,
} from '@/server/skills/package';

const PutBody = z.object({
  path: z.string().min(1).max(160),
  content: z.string().max(3 * 1024 * 1024),
  encoding: z.enum(['utf8', 'base64']).optional(),
  mime: z.string().max(120).optional(),
});

async function loadSkill(orgId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(skills)
    .where(and(eq(skills.orgId, orgId), eq(skills.id, id)))
    .limit(1);
  const skill = rows[0];
  if (!skill) throw new ApiError(404, '技能不存在');
  return skill;
}

function assertCanManage(skill: { createdBy: string | null }, auth: { role: Role; user: { id: string } }) {
  if (!isAdmin(auth.role) && skill.createdBy !== auth.user.id) {
    throw new ApiError(403, '只有管理员或创建者可以修改该技能');
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    await loadSkill(auth.org.id, id);
    const url = new URL(req.url);
    const requested = normalizePackagePath(url.searchParams.get('path') || '');
    const db = await getDb();
    const rows = await db
      .select()
      .from(skillFiles)
      .where(and(eq(skillFiles.orgId, auth.org.id), eq(skillFiles.skillId, id), eq(skillFiles.path, requested)))
      .limit(1);
    const file = rows[0];
    if (!file) throw new ApiError(404, '文件不存在');
    const buffer =
      file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : Buffer.from(file.content, 'utf8');
    const download = url.searchParams.get('download') === '1';
    const activeContent = /html|svg|xml|javascript/i.test(file.mime);
    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': activeContent
          ? 'text/plain; charset=utf-8'
          : file.mime || 'application/octet-stream',
        'content-length': String(buffer.byteLength),
        'content-disposition': `${download || activeContent ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(file.path.split('/').pop() || file.path)}`,
        'cache-control': 'private, max-age=60',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const skill = await loadSkill(auth.org.id, id);
    assertCanManage(skill, auth);
    const input = PutBody.parse(await readJson(req));
    const filePath = normalizePackagePath(input.path);
    const kind = classifyPath(filePath);
    const encoding = input.encoding || (isTextFile(filePath, input.mime) ? 'utf8' : 'base64');
    const mime = input.mime || mimeOf(filePath);
    if (encoding === 'utf8' && !isTextFile(filePath, mime)) {
      throw new ApiError(422, `${filePath} 需要以 base64 上传二进制内容`);
    }
    const bytes =
      encoding === 'base64'
        ? Buffer.from(input.content, 'base64')
        : Buffer.from(input.content, 'utf8');
    if (bytes.byteLength > MAX_FILE_BYTES) throw new ApiError(422, '单个文件不能超过 2MB');

    const db = await getDb();
    const existing = await db
      .select()
      .from(skillFiles)
      .where(and(eq(skillFiles.orgId, auth.org.id), eq(skillFiles.skillId, id), eq(skillFiles.path, filePath)))
      .limit(1);
    if (existing[0]) {
      await db
        .update(skillFiles)
        .set({
          kind,
          mime,
          size: bytes.byteLength,
          encoding,
          content: input.content,
          updatedAt: new Date(),
        })
        .where(eq(skillFiles.id, existing[0].id));
    } else {
      await db.insert(skillFiles).values({
        id: newId('skf'),
        orgId: auth.org.id,
        skillId: id,
        path: filePath,
        kind,
        mime,
        size: bytes.byteLength,
        encoding,
        content: input.content,
      });
    }

    const all = await loadSkillFiles(auth.org.id, id);
    const packages = all.map(toPackageFile);
    let validation: { errors: string[]; body?: string; name?: string; description?: string } = {
      errors: [],
    };
    if (filePath === 'SKILL.md') {
      const parsed = parseSkillMarkdown(input.content);
      validation = {
        errors: parsed.errors,
        body: parsed.body,
        name: parsed.frontmatter.name,
        description: parsed.frontmatter.description,
      };
      const manifest = {
        ...(skill.manifest || { tools: [] }),
        entry: 'SKILL.md',
        fileCount: all.length,
        packageSize: packages.reduce((sum, file) => sum + file.size, 0),
        frontmatter: parsed.frontmatter,
      };
      await db
        .update(skills)
        .set({
          ...(parsed.frontmatter.name ? { name: parsed.frontmatter.name.slice(0, 80) } : {}),
          ...(parsed.frontmatter.description
            ? { description: parsed.frontmatter.description.slice(0, 500) }
            : {}),
          instructions: parsed.body.slice(0, 30_000),
          manifest,
          updatedAt: new Date(),
        })
        .where(eq(skills.id, id));
    } else {
      await db
        .update(skills)
        .set({
          manifest: {
            ...(skill.manifest || { tools: [] }),
            fileCount: all.length,
            packageSize: packages.reduce((sum, file) => sum + file.size, 0),
          },
          updatedAt: new Date(),
        })
        .where(eq(skills.id, id));
    }

    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'skill.file.update',
      { type: 'skill', id },
      { path: filePath, size: bytes.byteLength },
    );
    return json({
      ok: true,
      file: all.find((file) => file.path === filePath),
      validation,
      summary: summarizePackage(packages),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const skill = await loadSkill(auth.org.id, id);
    assertCanManage(skill, auth);
    const url = new URL(req.url);
    const filePath = normalizePackagePath(url.searchParams.get('path') || '');
    if (filePath === 'SKILL.md') throw new ApiError(422, 'SKILL.md 是技能入口，不能删除');
    const db = await getDb();
    await db
      .delete(skillFiles)
      .where(and(eq(skillFiles.orgId, auth.org.id), eq(skillFiles.skillId, id), eq(skillFiles.path, filePath)));
    const all = await loadSkillFiles(auth.org.id, id);
    const packages = all.map(toPackageFile);
    await db
      .update(skills)
      .set({
        manifest: {
          ...(skill.manifest || { tools: [] }),
          fileCount: all.length,
          packageSize: packages.reduce((sum, file) => sum + file.size, 0),
        },
        updatedAt: new Date(),
      })
      .where(eq(skills.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'skill.file.delete',
      { type: 'skill', id },
      { path: filePath },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
