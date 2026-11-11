import path from 'node:path';
import { and, asc, eq } from 'drizzle-orm';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { getDb } from '@/server/db/client';
import {
  skillFiles,
  skillVersions,
  skills,
  type Skill,
  type SkillFile,
  type SkillFileKind,
  type SkillFrontmatter,
  type SkillManifest,
  type SkillPackageFile,
} from '@/server/db/schema';
import { newId } from '@/server/ids';
import { ApiError } from '@/server/http';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const MAX_SKILL_MD_BYTES = 200 * 1024;
const MAX_REFERENCE_BYTES = 500 * 1024;
const MAX_SCRIPT_BYTES = 200 * 1024;

const SCRIPT_EXT = new Set(['.mjs', '.js', '.cjs', '.py', '.sh']);
const REFERENCE_EXT = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.csv']);
const TEXT_EXT = new Set([
  ...SCRIPT_EXT,
  ...REFERENCE_EXT,
  '.ts',
  '.tsx',
  '.html',
  '.css',
  '.xml',
  '.svg',
]);

export type SkillPackageSummary = {
  files: SkillPackageFile[];
  entry: SkillPackageFile | null;
  frontmatter: SkillFrontmatter;
  body: string;
  valid: boolean;
  errors: string[];
  bytes: number;
  references: string[];
  scripts: string[];
  assets: string[];
};

export function normalizePackagePath(input: string): string {
  const raw = String(input || '').replace(/\\/g, '/').trim();
  if (!raw || raw.includes('\0')) throw new ApiError(422, '文件路径不能为空');
  if (path.posix.isAbsolute(raw) || /^[a-zA-Z]:/.test(raw)) throw new ApiError(422, '不允许绝对路径');
  const normalized = path.posix.normalize(raw).replace(/^\.\//, '');
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new ApiError(422, '文件路径不能越界');
  }
  if (!/^[\p{L}\p{N}._\-/ ]+$/u.test(normalized)) {
    throw new ApiError(422, '文件名只能包含中英文、数字、空格、点、下划线和短横线');
  }
  if (normalized.length > 160) throw new ApiError(422, '文件路径过长');
  return normalized;
}

export function classifyPath(input: string): SkillFileKind {
  const normalized = normalizePackagePath(input);
  if (normalized === 'SKILL.md') return 'skill';
  if (/^references\/[^/]+$/.test(normalized)) return 'reference';
  if (/^scripts\/[^/]+$/.test(normalized)) return 'script';
  if (/^assets\/[^/]+$/.test(normalized)) return 'asset';
  throw new ApiError(422, '只允许 SKILL.md、references/、scripts/、assets/ 下的文件');
}

export function mimeOf(filePath: string): string {
  const ext = path.posix.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.csv': 'text/csv',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.cjs': 'text/javascript',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.py': 'text/x-python',
    '.sh': 'text/x-shellscript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.xml': 'application/xml',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

export function isTextFile(filePath: string, mime?: string): boolean {
  if (mime?.startsWith('text/')) return true;
  if (mime === 'application/json' || mime === 'application/xml' || mime === 'image/svg+xml') return true;
  return TEXT_EXT.has(path.posix.extname(filePath).toLowerCase());
}

export function parseSkillMarkdown(content: string): {
  frontmatter: SkillFrontmatter;
  body: string;
  errors: string[];
} {
  const errors: string[] = [];
  const text = String(content || '');
  if (!text.trim()) return { frontmatter: {}, body: '', errors: ['SKILL.md 不能为空'] };
  if (!text.startsWith('---')) {
    return { frontmatter: {}, body: text.trim(), errors: ['SKILL.md 需要 YAML frontmatter（以 --- 开头）'] };
  }
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { frontmatter: {}, body: text.trim(), errors: ['frontmatter 缺少结束标记 ---'] };
  const header = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\r?\n/, '').trim();
  let raw: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(header);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      raw = parsed as Record<string, unknown>;
    } else {
      errors.push('frontmatter 必须是 YAML 对象');
    }
  } catch (err) {
    errors.push(`frontmatter 解析失败：${(err as Error).message.slice(0, 160)}`);
  }

  const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
  const name = asString(raw.name);
  const description = asString(raw.description);
  if (!name) errors.push('frontmatter 缺少 name');
  if (!description) errors.push('frontmatter 缺少 description');
  if (name.length > 80) errors.push('name 不能超过 80 字符');
  if (description.length > 800) errors.push('description 不能超过 800 字符');

  const allowedToolsRaw = raw['allowed-tools'] ?? raw.allowedTools;
  const allowedTools = Array.isArray(allowedToolsRaw)
    ? allowedToolsRaw.map((item) => String(item)).filter(Boolean).slice(0, 30)
    : typeof allowedToolsRaw === 'string'
      ? allowedToolsRaw.split(/[,\s]+/).filter(Boolean).slice(0, 30)
      : [];

  const metadataRaw = raw.metadata;
  const metadata =
    metadataRaw && typeof metadataRaw === 'object' && !Array.isArray(metadataRaw)
      ? Object.fromEntries(
          Object.entries(metadataRaw as Record<string, unknown>)
            .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
            .slice(0, 20)
            .map(([key, value]) => [key, String(value)]),
        )
      : {};

  return {
    frontmatter: {
      name,
      description,
      version: asString(raw.version) || undefined,
      license: asString(raw.license) || undefined,
      compatibility: asString(raw.compatibility) || undefined,
      allowedTools,
      metadata,
    },
    body,
    errors,
  };
}

export function composeSkillMarkdown(params: {
  name: string;
  description: string;
  body: string;
  version?: string;
  license?: string;
  allowedTools?: string[];
  category?: string;
}): string {
  const frontmatter: Record<string, unknown> = {
    name: params.name,
    description: params.description,
    ...(params.version ? { version: params.version } : { version: '1.0.0' }),
    ...(params.license ? { license: params.license } : { license: 'internal' }),
    ...(params.allowedTools?.length ? { 'allowed-tools': params.allowedTools } : {}),
    ...(params.category ? { metadata: { category: params.category } } : {}),
  };
  return `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n${params.body.trim()}\n`;
}

export function summarizePackage(files: Array<Pick<SkillPackageFile, 'path' | 'kind' | 'mime' | 'size'>>): SkillPackageSummary {
  const paths = new Set(files.map((file) => file.path));
  const entry = files.find((file) => file.path === 'SKILL.md') || null;
  const errors: string[] = [];
  if (!entry) errors.push('缺少 SKILL.md');
  if (entry && entry.size > MAX_SKILL_MD_BYTES) errors.push('SKILL.md 超过 200KB');
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) errors.push(`${file.path} 超过 2MB`);
  }
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > MAX_PACKAGE_BYTES) errors.push('技能包总大小超过 10MB');
  const references = [...paths].filter((item) => item.startsWith('references/'));
  const scripts = [...paths].filter((item) => item.startsWith('scripts/'));
  const assets = [...paths].filter((item) => item.startsWith('assets/'));
  return {
    files: files as SkillPackageFile[],
    entry: entry as SkillPackageFile | null,
    frontmatter: {},
    body: '',
    valid: errors.length === 0,
    errors,
    bytes,
    references,
    scripts,
    assets,
  };
}

export async function loadSkillFiles(orgId: string, skillId: string): Promise<SkillFile[]> {
  const db = await getDb();
  return db
    .select()
    .from(skillFiles)
    .where(and(eq(skillFiles.orgId, orgId), eq(skillFiles.skillId, skillId)))
    .orderBy(asc(skillFiles.path));
}

export function toPackageFile(row: SkillFile): SkillPackageFile {
  return {
    path: row.path,
    kind: row.kind,
    mime: row.mime,
    size: row.size,
    encoding: row.encoding,
    content: row.content,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureSkillPackage(orgId: string, skill: Skill): Promise<SkillFile[]> {
  const existing = await loadSkillFiles(orgId, skill.id);
  if (existing.some((file) => file.path === 'SKILL.md')) return existing;
  const body = skill.instructions?.trim() || `# ${skill.name}\n\n${skill.description || '请在此描述技能的工作方法与输出规范。'}`;
  const content = composeSkillMarkdown({
    name: skill.name,
    description: skill.description || `${skill.name} 技能`,
    body,
    version: `${skill.version || 1}.0.0`,
    category: skill.category,
  });
  const db = await getDb();
  const id = newId('skf');
  await db.insert(skillFiles).values({
    id,
    orgId,
    skillId: skill.id,
    path: 'SKILL.md',
    kind: 'skill',
    mime: 'text/markdown',
    size: Buffer.byteLength(content, 'utf8'),
    encoding: 'utf8',
    content,
  });
  const manifest = skill.manifest || { tools: [] };
  const nextFiles = await loadSkillFiles(orgId, skill.id);
  const packageSize = nextFiles.reduce(
    (sum, file) => sum + (file.path === 'SKILL.md' ? Buffer.byteLength(content, 'utf8') : file.size),
    0,
  );
  await db
    .update(skills)
    .set({
      manifest: {
        ...manifest,
        entry: 'SKILL.md',
        fileCount: nextFiles.length,
        packageSize,
        frontmatter: {
          name: skill.name,
          description: skill.description,
        },
      } satisfies SkillManifest,
      updatedAt: new Date(),
    })
    .where(eq(skills.id, skill.id));
  return loadSkillFiles(orgId, skill.id);
}

export async function validateSkillPackage(
  orgId: string,
  skill: Skill,
  files: SkillPackageFile[],
): Promise<{ frontmatter: SkillFrontmatter; body: string; errors: string[] }> {
  const summary = summarizePackage(files);
  const errors = [...summary.errors];
  const entry = files.find((file) => file.path === 'SKILL.md');
  if (!entry) return { frontmatter: {}, body: '', errors };
  if (entry.size > MAX_SKILL_MD_BYTES) errors.push('SKILL.md 超过 200KB');
  const parsed = parseSkillMarkdown(entry.content);
  errors.push(...parsed.errors);
  if (!parsed.body.trim()) errors.push('SKILL.md 正文不能为空');
  if (parsed.frontmatter.name && parsed.frontmatter.name !== skill.name) {
    // frontmatter 是包内标准名称，允许与展示名不同，但给出提示
  }
  for (const file of files) {
    if (file.kind === 'asset' && !isTextFile(file.path, file.mime) && file.encoding !== 'base64') {
      errors.push(`${file.path} 是二进制资源，需要 base64 编码`);
    }
    if (file.kind === 'script' && !SCRIPT_EXT.has(path.posix.extname(file.path).toLowerCase())) {
      errors.push(`${file.path} 不是受支持的脚本类型（.mjs/.js/.cjs/.py/.sh）`);
    }
    if (file.kind === 'reference' && !REFERENCE_EXT.has(path.posix.extname(file.path).toLowerCase())) {
      errors.push(`${file.path} 不是受支持的参考文件类型`);
    }
    if (file.kind === 'script' && file.size > MAX_SCRIPT_BYTES) errors.push(`${file.path} 超过 200KB`);
    if (file.kind === 'reference' && file.size > MAX_REFERENCE_BYTES) errors.push(`${file.path} 超过 500KB`);
  }
  void orgId;
  return { frontmatter: parsed.frontmatter, body: parsed.body, errors: [...new Set(errors)] };
}

export async function publishedPackageFiles(
  orgId: string,
  skillId: string,
  version: number,
): Promise<SkillPackageFile[] | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(skillVersions)
    .where(
      and(
        eq(skillVersions.orgId, orgId),
        eq(skillVersions.skillId, skillId),
        eq(skillVersions.version, version),
      ),
    )
    .limit(1);
  const snapshot = rows[0]?.snapshot as
    | { files?: SkillPackageFile[]; instructions?: string }
    | undefined;
  if (snapshot?.files?.length) return snapshot.files;
  return null;
}
