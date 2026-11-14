import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { messages, type MessagePart } from '@/server/db/schema';
import type { RuntimeTool, ToolResult } from './types';

type ToolPart = Extract<MessagePart, { type: 'tool' }>;

async function threadMessages(threadId: string, orgId: string) {
  const db = await getDb();
  const rows = await db
    .select({ id: messages.id, role: messages.role, content: messages.content, parts: messages.parts, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.orgId, orgId), eq(messages.threadId, threadId)))
    .orderBy(desc(messages.createdAt))
    .limit(300);
  return rows.reverse();
}

function snippet(text: string, query: string, radius = 1_600): string {
  const index = text.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) return text.slice(0, radius * 2);
  const start = Math.max(0, index - radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, start + radius * 2)}${start + radius * 2 < text.length ? '…' : ''}`;
}

const evidenceSearch: RuntimeTool = {
  name: 'evidence_search',
  title: '检索工具证据',
  description:
    '在当前会话已执行过的工具结果中检索关键词，返回带 evidenceId 的片段。上下文只保留摘要时，用这个工具找回原始行情、财务或研究资料细节。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '关键词，例如 ROE、营收、支撑位、风险' },
      limit: { type: 'integer', minimum: 1, maximum: 5, description: '返回条数，默认 3' },
    },
    required: ['query'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    if (!ctx.threadId) return { content: '当前没有可检索的会话', isError: true };
    const query = String(args.query || '').trim();
    if (!query) return { content: '检索关键词为空', isError: true };
    const limit = Math.min(Math.max(Number(args.limit) || 3, 1), 5);
    const rows = await threadMessages(ctx.threadId, ctx.orgId);
    const matches: Array<{ part: ToolPart; text: string }> = [];
    for (const row of rows) {
      for (const part of (row.parts || []) as MessagePart[]) {
        if (part.type !== 'tool' || !part.output) continue;
        if (part.output.toLowerCase().includes(query.toLowerCase())) matches.push({ part, text: part.output });
      }
    }
    const selected = matches.slice(-limit).reverse();
    if (!selected.length) {
      return {
        content: `没有找到包含「${query}」的工具证据。可换更短的关键词，或直接读取最近工具结果。`,
        summary: '0 条证据',
      };
    }
    const body = selected
      .map(
        ({ part, text }, index) =>
          `[${index + 1}] evidenceId=${part.id} · ${part.name} · ${part.summary || ''}\n${snippet(text, query)}`,
      )
      .join('\n\n');
    return {
      content: `<untrusted_data type="tool_evidence">\n${body}\n</untrusted_data>`,
      summary: `找到 ${selected.length} 条证据`,
    };
  },
};

const evidenceRead: RuntimeTool = {
  name: 'evidence_read',
  title: '读取工具证据',
  description:
    '按 evidenceId 分页读取完整工具结果。上下文中的工具输出是压缩摘要，需要精确数字或完整表格时使用；offset 从 0 开始。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      evidenceId: { type: 'string', description: 'evidence_search 返回的 evidenceId，或工具调用 id' },
      offset: { type: 'integer', minimum: 0, description: '字符偏移，默认 0' },
      limit: { type: 'integer', minimum: 500, maximum: 8000, description: '读取长度，默认 4000' },
    },
    required: ['evidenceId'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    if (!ctx.threadId) return { content: '当前没有可读取的会话', isError: true };
    const evidenceId = String(args.evidenceId || '').trim();
    const offset = Math.max(Number(args.offset) || 0, 0);
    const limit = Math.min(Math.max(Number(args.limit) || 4_000, 500), 8_000);
    const rows = await threadMessages(ctx.threadId, ctx.orgId);
    for (const row of rows) {
      for (const part of (row.parts || []) as MessagePart[]) {
        if (part.type !== 'tool' || part.id !== evidenceId || !part.output) continue;
        const slice = part.output.slice(offset, offset + limit);
        const next = offset + slice.length;
        return {
          content: `<untrusted_data type="tool_evidence" evidenceId="${part.id}">\n${slice}\n</untrusted_data>\n${next < part.output.length ? `\n（还有后续内容，可用 offset=${next} 继续读取）` : '\n（已读取到末尾）'}`,
          summary: `${part.name} · ${offset}-${next} / ${part.output.length}`,
        };
      }
    }
    return { content: `未找到工具证据 ${evidenceId}`, isError: true };
  },
};

const historySearch: RuntimeTool = {
  name: 'history_search',
  title: '检索历史对话',
  description:
    '在当前会话的历史消息中检索关键词，返回相关片段。旧报告、先前结论或用户偏好没有进入当前上下文时，用这个工具找回，而不是要求重发或猜测。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '关键词，例如标的名、结论、风险、用户偏好' },
      limit: { type: 'integer', minimum: 1, maximum: 5, description: '返回条数，默认 3' },
    },
    required: ['query'],
  },
  async execute(args, ctx): Promise<ToolResult> {
    if (!ctx.threadId) return { content: '当前没有历史会话', isError: true };
    const query = String(args.query || '').trim();
    if (!query) return { content: '检索关键词为空', isError: true };
    const limit = Math.min(Math.max(Number(args.limit) || 3, 1), 5);
    const rows = await threadMessages(ctx.threadId, ctx.orgId);
    const selected = rows
      .filter((row) => row.role !== 'system' && row.content?.toLowerCase().includes(query.toLowerCase()))
      .slice(-limit)
      .reverse();
    if (!selected.length) {
      return { content: `历史对话中没有找到「${query}」相关内容。`, summary: '0 条历史' };
    }
    const body = selected
      .map(
        (row, index) =>
          `[${index + 1}] ${row.role} · ${row.createdAt.toISOString().slice(0, 19)}\n${snippet(row.content, query)}`,
      )
      .join('\n\n');
    return {
      content: `<untrusted_data type="history_evidence">\n${body}\n</untrusted_data>`,
      summary: `找到 ${selected.length} 条历史`,
    };
  },
};

export const memoryTools: RuntimeTool[] = [evidenceSearch, evidenceRead, historySearch];
