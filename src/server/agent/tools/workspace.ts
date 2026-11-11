import path from 'node:path';
import { createArtifact } from '@/server/artifacts';
import { listFiles, readFile } from '@/server/security/workspace';
import { truncate } from '@/server/agent/validate';
import type { RuntimeTool } from './types';

export const workspaceWriteTool: RuntimeTool = {
  name: 'workspace_write',
  title: '写入交付物',
  description:
    '把成果写入工作区，生成用户可预览、可下载的交付物文件。写文档、报告、表格、代码时使用。',
  dangerous: true,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件名，例如 增长复盘.md（可含子目录）' },
      content: { type: 'string', description: '完整文件内容' },
    },
    required: ['path', 'content'],
  },
  async execute(args, ctx) {
    const relative = String(args.path || '').trim();
    const content = String(args.content || '');
    if (!relative) return { content: '文件名不能为空', isError: true };
    if (content.length > 500_000) return { content: '文件内容超过 500k 字符限制', isError: true };
    const name = path.basename(relative);
    const artifact = await createArtifact({
      orgId: ctx.orgId,
      scopeId: ctx.scopeId,
      name,
      relativePath: relative,
      content,
      taskId: ctx.taskId,
      threadId: ctx.threadId,
      messageId: ctx.messageId,
    });
    return {
      content: `已写入 ${relative}（${artifact.size} 字节），交付物 ID：${artifact.id}`,
      summary: `已生成 ${name}`,
      artifacts: [
        {
          id: artifact.id,
          name: artifact.name,
          mime: artifact.mime,
          size: artifact.size,
          kind: artifact.kind,
        },
      ],
    };
  },
};

export const workspaceReadTool: RuntimeTool = {
  name: 'workspace_read',
  title: '读取交付物',
  description: '读取当前会话工作区中的文件内容。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: { path: { type: 'string', description: '文件相对路径' } },
    required: ['path'],
  },
  async execute(args, ctx) {
    const relative = String(args.path || '');
    try {
      const content = await readFile(ctx.orgId, ctx.scopeId, relative);
      return { content: truncate(content), summary: `读取 ${relative}` };
    } catch (err) {
      return { content: `读取失败：${(err as Error).message}`, isError: true };
    }
  },
};

export const workspaceListTool: RuntimeTool = {
  name: 'workspace_list',
  title: '列出交付物',
  description: '列出当前会话工作区中的全部文件。',
  readonly: true,
  parameters: { type: 'object', properties: {} },
  async execute(_args, ctx) {
    const files = await listFiles(ctx.orgId, ctx.scopeId);
    if (!files.length) return { content: '工作区为空', summary: '0 个文件' };
    const body = files.map((f) => `- ${f.path} (${f.size} B)`).join('\n');
    return { content: body, summary: `${files.length} 个文件` };
  },
};
