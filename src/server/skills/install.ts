import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import {
  expertSkills,
  experts,
  skillFiles,
  skillVersions,
  skills,
  type SkillManifest,
  type SkillPackageFile,
} from '@/server/db/schema';
import { newId } from '@/server/ids';
import {
  classifyPath,
  composeSkillMarkdown,
  mimeOf,
  parseSkillMarkdown,
} from './package';
import { SKILL_LIBRARY, type SkillDefinition, type SkillSeedFile } from './library';

type PackageFileDraft = SkillSeedFile & {
  kind: ReturnType<typeof classifyPath>;
  mime: string;
  size: number;
};

function buildFiles(def: SkillDefinition): PackageFileDraft[] {
  const markdown = composeSkillMarkdown({
    name: def.name,
    description: def.description,
    body: def.body,
    version: def.version,
    license: def.license,
    allowedTools: def.allowedTools,
    category: def.category,
  });
  const source: SkillSeedFile[] = [
    { path: 'SKILL.md', content: markdown },
    ...def.files,
  ];
  return source.map((file) => {
    const encoding = file.encoding || 'utf8';
    return {
      ...file,
      encoding,
      kind: classifyPath(file.path),
      mime: mimeOf(file.path),
      size: encoding === 'base64' ? Buffer.from(file.content, 'base64').length : Buffer.byteLength(file.content, 'utf8'),
    };
  });
}

function manifestOf(files: PackageFileDraft[]): SkillManifest {
  const entry = files.find((file) => file.path === 'SKILL.md');
  const parsed = entry ? parseSkillMarkdown(entry.content) : { frontmatter: {}, body: '', errors: [] };
  return {
    tools: [],
    entry: 'SKILL.md',
    fileCount: files.length,
    packageSize: files.reduce((sum, file) => sum + file.size, 0),
    frontmatter: parsed.frontmatter,
  };
}

async function insertFiles(orgId: string, skillId: string, files: PackageFileDraft[]): Promise<void> {
  const db = await getDb();
  await db.insert(skillFiles).values(
    files.map((file) => ({
      id: newId('skf'),
      orgId,
      skillId,
      path: file.path,
      kind: file.kind,
      mime: file.mime,
      size: file.size,
      encoding: file.encoding || 'utf8',
      content: file.content,
    })),
  );
}

async function insertVersion(params: {
  orgId: string;
  skillId: string;
  version: number;
  def: SkillDefinition;
  userId: string;
  files: PackageFileDraft[];
  manifest: SkillManifest;
  createdAt?: Date;
}): Promise<void> {
  const db = await getDb();
  const snapshotFiles: SkillPackageFile[] = params.files.map((file) => ({
    path: file.path,
    kind: file.kind,
    mime: file.mime,
    size: file.size,
    encoding: file.encoding || 'utf8',
    content: file.content,
  }));
  await db.insert(skillVersions).values({
    id: newId('skv'),
    orgId: params.orgId,
    skillId: params.skillId,
    version: params.version,
    snapshot: {
      name: params.def.name,
      description: params.def.description,
      type: 'instruction',
      instructions: params.def.body,
      manifest: params.manifest,
      entry: 'SKILL.md',
      files: snapshotFiles,
      publishedAt: (params.createdAt || new Date()).toISOString(),
    },
    createdBy: params.userId,
  });
}

async function createSkill(orgId: string, userId: string, def: SkillDefinition): Promise<string> {
  const db = await getDb();
  const files = buildFiles(def);
  const manifest = manifestOf(files);
  const id = newId('skl');
  await db.insert(skills).values({
    id,
    orgId,
    name: def.name,
    description: def.description,
    type: 'instruction',
    icon: def.icon,
    category: def.category,
    instructions: def.body,
    manifest,
    status: 'published',
    visibility: 'public',
    version: 1,
    createdBy: userId,
  });
  await insertFiles(orgId, id, files);
  await insertVersion({ orgId, skillId: id, version: 1, def, userId, files, manifest });
  return id;
}

async function updateSkill(orgId: string, userId: string, skillId: string, def: SkillDefinition): Promise<void> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(skills)
    .where(and(eq(skills.orgId, orgId), eq(skills.id, skillId)))
    .limit(1);
  const existing = rows[0];
  if (!existing) throw new Error('技能不存在');
  const files = buildFiles(def);
  const manifest = { ...manifestOf(files), tools: existing.manifest?.tools || [] };
  const nextVersion = Math.max(existing.version || 0, 0) + 1;
  await db.delete(skillFiles).where(and(eq(skillFiles.orgId, orgId), eq(skillFiles.skillId, skillId)));
  await db
    .update(skills)
    .set({
      name: def.name,
      description: def.description,
      type: 'instruction',
      icon: def.icon,
      category: def.category,
      instructions: def.body,
      manifest,
      status: 'published',
      visibility: 'public',
      version: nextVersion,
      updatedAt: new Date(),
    })
    .where(eq(skills.id, skillId));
  await insertFiles(orgId, skillId, files);
  await insertVersion({
    orgId,
    skillId,
    version: nextVersion,
    def,
    userId: existing.createdBy || userId,
    files,
    manifest,
  });
}

async function bindSkill(orgId: string, skillId: string, expertName: string): Promise<boolean> {
  const db = await getDb();
  const expertRows = await db
    .select({ id: experts.id })
    .from(experts)
    .where(and(eq(experts.orgId, orgId), eq(experts.name, expertName)))
    .limit(1);
  const expert = expertRows[0];
  if (!expert) return false;
  const existing = await db
    .select({ id: expertSkills.id })
    .from(expertSkills)
    .where(
      and(
        eq(expertSkills.orgId, orgId),
        eq(expertSkills.expertId, expert.id),
        eq(expertSkills.skillId, skillId),
      ),
    )
    .limit(1);
  if (existing.length) return false;
  await db.insert(expertSkills).values({
    id: newId('esk'),
    orgId,
    expertId: expert.id,
    skillId,
    version: 0,
    enabled: true,
  });
  return true;
}

export async function bindSeedSkills(orgId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.orgId, orgId));
  const byName = new Map(rows.map((row) => [row.name, row.id]));
  let bound = 0;
  for (const def of SKILL_LIBRARY) {
    const skillId = byName.get(def.name);
    if (!skillId) continue;
    for (const expertName of def.bindTo) {
      if (await bindSkill(orgId, skillId, expertName)) bound += 1;
    }
  }
  return bound;
}

export async function installSkillLibrary(
  orgId: string,
  userId: string,
  options: { force?: boolean } = {},
): Promise<{ ids: Map<string, string>; created: number; updated: number; skipped: number }> {
  const db = await getDb();
  const existingRows = await db
    .select({ id: skills.id, name: skills.name })
    .from(skills)
    .where(eq(skills.orgId, orgId));
  const existing = new Map(existingRows.map((row) => [row.name, row.id]));
  const ids = new Map<string, string>();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const def of SKILL_LIBRARY) {
    const current = existing.get(def.name);
    if (!current) {
      const id = await createSkill(orgId, userId, def);
      ids.set(def.name, id);
      created += 1;
    } else if (options.force) {
      await updateSkill(orgId, userId, current, def);
      ids.set(def.name, current);
      updated += 1;
    } else {
      ids.set(def.name, current);
      skipped += 1;
    }
  }
  return { ids, created, updated, skipped };
}
