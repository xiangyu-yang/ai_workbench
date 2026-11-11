import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DATA_DIR, env } from '@/server/env';
import type { Skill, SkillPackageFile } from '@/server/db/schema';
import { loadSkillFiles, publishedPackageFiles, toPackageFile } from '@/server/skills/package';
import type { RuntimeTool } from './types';

const execFileAsync = promisify(execFile);

export type SkillPackageRuntime = {
  id: string;
  name: string;
  version: number;
  files: SkillPackageFile[];
  body: string;
  references: string[];
  scripts: string[];
  assets: string[];
  frontmatter: Record<string, unknown>;
};

function fileText(file: SkillPackageFile): string {
  if (file.encoding === 'base64') return `（二进制资源，${file.size} 字节，MIME ${file.mime}）`;
  return file.content;
}

export async function loadSkillRuntimePackage(
  orgId: string,
  skill: Skill,
  version: number,
): Promise<SkillPackageRuntime | null> {
  let files: SkillPackageFile[] | null = version > 0
    ? await publishedPackageFiles(orgId, skill.id, version)
    : null;
  if (!files) {
    const rows = await loadSkillFiles(orgId, skill.id);
    files = rows.map(toPackageFile);
  }
  if (!files.length) return null;
  const entry = files.find((file) => file.path === 'SKILL.md');
  if (!entry) return null;
  const content = entry.encoding === 'base64' ? '' : entry.content;
  const frontmatter: Record<string, unknown> = {};
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (match && match[2]) frontmatter[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
  return {
    id: skill.id,
    name: skill.name,
    version,
    files,
    body: body || skill.instructions,
    references: files.filter((file) => file.kind === 'reference').map((file) => file.path),
    scripts: files.filter((file) => file.kind === 'script').map((file) => file.path),
    assets: files.filter((file) => file.kind === 'asset').map((file) => file.path),
    frontmatter,
  };
}

export function skillPromptBlock(pkg: SkillPackageRuntime): string {
  const lines = [`### 技能包：${pkg.name}`, '', pkg.body || '（无 SKILL.md 正文）'];
  if (pkg.references.length) {
    lines.push(
      '',
      '#### 参考文件（按需读取）',
      ...pkg.references.map((file) => `- ${file}`),
      '需要细节时调用 read_skill_file，不要凭空假设文件内容。',
    );
  }
  if (pkg.scripts.length) {
    lines.push(
      '',
      '#### 脚本',
      ...pkg.scripts.map((file) => `- ${file}`),
      env.SKILL_ALLOW_SCRIPTS
        ? '需要执行时调用 run_skill_script；该操作会请求人工审批。'
        : '脚本已随包发布，但当前部署未开启脚本执行。',
    );
  }
  if (pkg.assets.length) {
    lines.push('', '#### 资源', ...pkg.assets.map((file) => `- ${file}`));
  }
  return lines.join('\n');
}

function findPackage(packages: SkillPackageRuntime[], key: string): SkillPackageRuntime | null {
  const query = key.trim().toLowerCase();
  return (
    packages.find((pkg) => pkg.id === key) ||
    packages.find((pkg) => pkg.name.toLowerCase() === query) ||
    packages.find((pkg) => pkg.name.toLowerCase().includes(query)) ||
    null
  );
}

function getFile(pkg: SkillPackageRuntime, filePath: string): SkillPackageFile | null {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  return pkg.files.find((file) => file.path === normalized) || null;
}

export function buildSkillPackageTools(
  packages: SkillPackageRuntime[],
  options: { allowScripts: boolean },
): RuntimeTool[] {
  if (!packages.length) return [];
  const tools: RuntimeTool[] = [
    {
      name: 'skill_read_file',
      title: '读取技能包文件',
      description:
        '读取当前专家已绑定技能包中的参考文件、脚本或资源说明。参数 skill 可以是技能名称或 ID，path 必须是包内路径。',
      readonly: true,
      parameters: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: '技能名称或 ID' },
          path: { type: 'string', description: '包内文件路径，如 references/checklist.md' },
        },
        required: ['skill', 'path'],
      },
      async execute(args) {
        const pkg = findPackage(packages, String(args.skill || ''));
        if (!pkg) return { content: '未找到该技能包', isError: true };
        const file = getFile(pkg, String(args.path || ''));
        if (!file) {
          return {
            content: `未找到文件 ${String(args.path || '')}。可用文件：${pkg.files.map((item) => item.path).join(', ')}`,
            isError: true,
          };
        }
        if (file.encoding === 'base64') {
          return {
            content: `${file.path} 是二进制资源（${file.mime}，${file.size} 字节），请在界面的技能包中预览或下载。`,
            summary: file.path,
          };
        }
        const content = file.content.slice(0, 30_000);
        return {
          content: `文件：${file.path}\n\n${content}${file.content.length > 30_000 ? '\n\n（内容已截断）' : ''}`,
          summary: file.path,
        };
      },
    },
  ];

  if (options.allowScripts) {
    tools.push({
      name: 'run_skill_script',
      title: '执行技能脚本',
      description:
        '执行技能包 scripts/ 下的脚本。仅支持 .mjs/.js/.cjs/.py/.sh；会在隔离工作目录中运行，超时 30 秒，并需要人工审批。',
      dangerous: true,
      alwaysApprove: true,
      parameters: {
        type: 'object',
        properties: {
          skill: { type: 'string', description: '技能名称或 ID' },
          script: { type: 'string', description: 'scripts/ 下的脚本路径' },
          args: {
            type: 'array',
            items: { type: 'string' },
            description: '传给脚本的参数（可选，最多 10 个）',
          },
        },
        required: ['skill', 'script'],
      },
      async execute(args, ctx) {
        const pkg = findPackage(packages, String(args.skill || ''));
        if (!pkg) return { content: '未找到该技能包', isError: true };
        const scriptPath = String(args.script || '').replace(/\\/g, '/');
        if (!scriptPath.startsWith('scripts/') || scriptPath.includes('..')) {
          return { content: '只能执行 scripts/ 下的脚本', isError: true };
        }
        const file = getFile(pkg, scriptPath);
        if (!file || !pkg.scripts.includes(scriptPath)) {
          return { content: `未找到脚本 ${scriptPath}`, isError: true };
        }
        const ext = path.posix.extname(scriptPath).toLowerCase();
        const interpreter =
          ext === '.py' ? 'python3' : ext === '.sh' ? '/bin/bash' : ext === '.mjs' || ext === '.js' || ext === '.cjs' ? 'node' : '';
        if (!interpreter) return { content: '不支持的脚本类型', isError: true };
        const rawArgs = Array.isArray(args.args) ? args.args.map((item) => String(item)).slice(0, 10) : [];
        if (rawArgs.some((item) => item.length > 300 || item.includes('\0'))) {
          return { content: '脚本参数过长或包含非法字符', isError: true };
        }

        const root = path.join(
          DATA_DIR,
          'skill-runs',
          ctx.orgId.replace(/[^a-zA-Z0-9_-]/g, '_'),
          pkg.id.replace(/[^a-zA-Z0-9_-]/g, '_'),
          String(pkg.version || 'draft'),
        );
        await fs.mkdir(root, { recursive: true });
        for (const item of pkg.files) {
          const target = path.join(root, item.path);
          if (!target.startsWith(root + path.sep)) continue;
          await fs.mkdir(path.dirname(target), { recursive: true });
          if (item.encoding === 'base64') {
            await fs.writeFile(target, Buffer.from(item.content, 'base64'));
          } else {
            await fs.writeFile(target, item.content, 'utf8');
          }
        }
        const scriptAbs = path.join(root, scriptPath);
        try {
          const { stdout, stderr } = await execFileAsync(interpreter, [scriptAbs, ...rawArgs], {
            cwd: root,
            timeout: 30_000,
            maxBuffer: 1024 * 1024,
            signal: ctx.signal,
            env: {
              PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
              HOME: root,
              LANG: process.env.LANG || 'en_US.UTF-8',
              NODE_ENV: process.env.NODE_ENV || 'production',
              SKILL_RUN: '1',
            },
          });
          const output = `${stdout || ''}${stderr ? `\n[stderr]\n${stderr}` : ''}`.trim();
          return {
            content: output.slice(0, 20_000) || '（脚本执行成功，无输出）',
            summary: scriptPath,
          };
        } catch (err) {
          const error = err as Error & { stdout?: string; stderr?: string };
          return {
            content: `脚本执行失败：${error.message}\n${(error.stdout || '').slice(0, 4000)}\n${(error.stderr || '').slice(0, 4000)}`,
            isError: true,
            summary: scriptPath,
          };
        }
      },
    });
  }
  return tools;
}
