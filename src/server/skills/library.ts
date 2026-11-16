import fs from 'node:fs';
import path from 'node:path';
import { parseSkillMarkdown } from './package';

/**
 * 内置技能以 skills/ 目录为源文件（SKILL.md + references/ + scripts/ + assets/），
 * 启动或种子时读取为 SkillDefinition，再写入数据库成为可版本化的运行时快照。
 *
 * 这样源码、代码评审、脚本调试与 Anthropic Agent Skills 目录规范一致；
 * 运行时不直接读磁盘，仍使用数据库中的已发布版本，保证可复现和审计。
 */
export type SkillSeedFile = {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
};

export type SkillDefinition = {
  name: string;
  description: string;
  category: string;
  icon: string;
  version: string;
  license: string;
  allowedTools: string[];
  body: string;
  /** 原始 SKILL.md，保留标准 frontmatter（name/display-name/metadata） */
  entryContent?: string;
  files: SkillSeedFile[];
  bindTo: string[];
  requiresExecution?: boolean;
};

const SKILL_ORDER = [
  '周报生成器',
  '数据分析与洞察',
  '竞品研究',
  '会议纪要与行动项',
  '客服工单分级与回复',
  '深度调研方法论',
  '结构化写作规范',
  'RFP 投标响应',
  '股票深度分析与预测',
];

const TEXT_EXT = new Set([
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.sh',
  '.html',
  '.css',
  '.xml',
  '.svg',
]);

function skillsRoot(): string {
  return process.env.SKILLS_DIR || path.join(process.cwd(), 'skills');
}

function filesUnder(directory: string, base = directory): SkillSeedFile[] {
  const files: SkillSeedFile[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__pycache__' || entry.name === 'node_modules') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...filesUnder(full, base));
      continue;
    }
    const relative = path.relative(base, full).split(path.sep).join('/');
    if (relative === 'SKILL.md') continue;
    if (!relative.startsWith('references/') && !relative.startsWith('scripts/') && !relative.startsWith('assets/')) {
      continue;
    }
    const buffer = fs.readFileSync(full);
    const extension = path.extname(entry.name).toLowerCase();
    const binary = !TEXT_EXT.has(extension) || buffer.includes(0);
    files.push({
      path: relative,
      content: binary ? buffer.toString('base64') : buffer.toString('utf8'),
      ...(binary ? { encoding: 'base64' as const } : {}),
    });
  }
  return files;
}

function loadDefinition(directory: string): SkillDefinition {
  const skillPath = path.join(directory, 'SKILL.md');
  if (!fs.existsSync(skillPath)) throw new Error(`技能包缺少 SKILL.md：${skillPath}`);
  const parsed = parseSkillMarkdown(fs.readFileSync(skillPath, 'utf8'));
  if (parsed.errors.length) {
    throw new Error(`技能包 ${path.basename(directory)} 的 SKILL.md 无效：${parsed.errors.join('；')}`);
  }
  const metadata = parsed.frontmatter.metadata || {};
  const name = metadata['display-name'] || parsed.frontmatter.name;
  const description = parsed.frontmatter.description;
  if (!name || !description) throw new Error(`技能包 ${path.basename(directory)} 缺少 name/description`);
  return {
    name,
    description,
    category: metadata.category || '内置',
    icon: metadata.icon || 'spark',
    version: parsed.frontmatter.version || '1.0.0',
    license: parsed.frontmatter.license || 'internal',
    allowedTools: parsed.frontmatter.allowedTools || [],
    body: parsed.body,
    entryContent: fs.readFileSync(skillPath, 'utf8'),
    files: filesUnder(directory),
    bindTo: (metadata['bind-to'] || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    requiresExecution: metadata['requires-execution'] === 'true',
  };
}

function loadSkillLibrary(): SkillDefinition[] {
  const root = skillsRoot();
  if (!fs.existsSync(root)) {
    throw new Error(`技能源目录不存在：${root}。请检查部署是否复制了 skills/，或设置 SKILLS_DIR。`);
  }
  const directories = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, 'SKILL.md')));
  const definitions = directories.map(loadDefinition);
  const order = new Map(SKILL_ORDER.map((name, index) => [name, index]));
  return definitions.sort((a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999));
}

export const SKILL_LIBRARY: SkillDefinition[] = loadSkillLibrary();
