import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { skillFiles, skills } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { ApiError, assertSameOrigin, errorResponse, json, requireApi } from '@/server/http';
import { audit } from '@/server/audit';
import { isAdmin } from '@/server/auth/rbac';
import {
  MAX_FILE_BYTES,
  loadSkillFiles,
  mimeOf,
  normalizePackagePath,
  toPackageFile,
} from '@/server/skills/package';

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
      throw new ApiError(403, '只有管理员或创建者可以修改该技能');
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(422, '请选择要上传的资源文件');
    if (file.size > MAX_FILE_BYTES) throw new ApiError(422, '单个资源文件不能超过 2MB');
    const original = path.posix.basename(file.name || 'asset');
    const safeName = original.replace(/[^\p{L}\p{N}._\- ]/gu, '_').slice(0, 120) || 'asset';
    const requested = normalizePackagePath(`assets/${safeName}`);
    const existing = await db
      .select({ id: skillFiles.id })
      .from(skillFiles)
      .where(
        and(
          eq(skillFiles.orgId, auth.org.id),
          eq(skillFiles.skillId, id),
          eq(skillFiles.path, requested),
        ),
      )
      .limit(1);
    if (existing.length) throw new ApiError(409, '同名资源已存在，请先删除或重命名');

    const buffer = Buffer.from(await file.arrayBuffer());
    const mime = file.type || mimeOf(requested);
    await db.insert(skillFiles).values({
      id: newId('skf'),
      orgId: auth.org.id,
      skillId: id,
      path: requested,
      kind: 'asset',
      mime,
      size: buffer.byteLength,
      encoding: 'base64',
      content: buffer.toString('base64'),
    });
    const all = await loadSkillFiles(auth.org.id, id);
    const packages = all.map(toPackageFile);
    await db
      .update(skills)
      .set({
        manifest: {
          ...(skill.manifest || { tools: [] }),
          fileCount: all.length,
          packageSize: packages.reduce((sum, item) => sum + item.size, 0),
        },
        updatedAt: new Date(),
      })
      .where(eq(skills.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'skill.asset.upload',
      { type: 'skill', id },
      { path: requested, size: buffer.byteLength },
    );
    return json({ ok: true, path: requested, size: buffer.byteLength, mime });
  } catch (err) {
    return errorResponse(err);
  }
}
