import fs from 'node:fs/promises';
import path from 'node:path';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { attachments, messages, type MessagePart } from '@/server/db/schema';
import { DATA_DIR } from '@/server/env';
import type { LlmMessage, UserContentPart } from '@/server/llm/types';

const MAX_TOTAL_CHARS = 18_000;

export function textOfParts(parts: MessagePart[]): string {
  return parts
    .filter((p): p is Extract<MessagePart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function attachmentsOf(parts: MessagePart[]): Extract<MessagePart, { type: 'attachment' }>[] {
  return parts.filter(
    (p): p is Extract<MessagePart, { type: 'attachment' }> => p.type === 'attachment',
  );
}

async function loadAttachmentContent(
  orgId: string,
  attachmentIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!attachmentIds.length) return out;
  const db = await getDb();
  const rows = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.orgId, orgId), inArray(attachments.id, attachmentIds)));
  for (const row of rows) {
    try {
      const full = path.isAbsolute(row.path) ? row.path : path.join(DATA_DIR, row.path);
      if (!full.startsWith(DATA_DIR)) continue;
      const buffer = await fs.readFile(full);
      if (row.kind === 'image') {
        out.set(row.id, `data:${row.mime};base64,${buffer.toString('base64')}`);
      } else if (buffer.byteLength < 200_000) {
        out.set(row.id, buffer.toString('utf8').slice(0, 20_000));
      }
    } catch {
      /* ignore missing file */
    }
  }
  return out;
}

export async function buildHistory(params: {
  orgId: string;
  threadId: string;
  excludeMessageId?: string;
  maxChars?: number;
}): Promise<LlmMessage[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.orgId, params.orgId), eq(messages.threadId, params.threadId)))
    .orderBy(asc(messages.createdAt))
    .limit(80);

  const filtered = rows.filter(
    (m) => m.id !== params.excludeMessageId && (m.parts?.length || m.content),
  );

  const attachmentIds = filtered.flatMap((m) => attachmentsOf(m.parts || []).map((a) => a.attachmentId));
  const attachmentContent = await loadAttachmentContent(params.orgId, attachmentIds);
  let imageBudget = 3;

  const result: LlmMessage[] = [];
  for (const row of filtered) {
    const parts = row.parts || [];
    if (row.role === 'user') {
      const text = textOfParts(parts);
      const content: UserContentPart[] = [];
      if (text.trim()) content.push({ type: 'text', text });
      for (const att of attachmentsOf(parts)) {
        if (att.kind === 'image' && imageBudget > 0) {
          const dataUrl = attachmentContent.get(att.attachmentId);
          if (dataUrl) {
            content.push({ type: 'image', mime: att.mime, dataUrl });
            imageBudget -= 1;
          }
        } else if (att.kind === 'file') {
          const fileText = attachmentContent.get(att.attachmentId);
          content.push({
            type: 'text',
            text: fileText
              ? `\n\n[附件：${att.name}]\n${fileText}`
              : `\n\n[附件：${att.name}（${att.mime}，${att.size} 字节）]`,
          });
        }
      }
      const single = content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text).join('');
      if (content.every((c) => c.type === 'text')) {
        result.push({ role: 'user', content: single || '（空消息）' });
      } else {
        result.push({ role: 'user', content });
      }
      continue;
    }

    if (row.role === 'assistant') {
      const text = textOfParts(parts);
      const toolParts = parts.filter(
        (p): p is Extract<MessagePart, { type: 'tool' }> => p.type === 'tool',
      );
      const toolCalls = toolParts
        .filter((p) => p.status !== 'pending_approval')
        .map((p) => ({
          id: p.id,
          name: p.name,
          args: (p.args || {}) as Record<string, unknown>,
        }));
      if (text || toolCalls.length) {
        result.push({
          role: 'assistant',
          content: text,
          toolCalls: toolCalls.length ? toolCalls : undefined,
        });
      }
      for (const tool of toolParts) {
        if (tool.status === 'pending_approval') continue;
        result.push({
          role: 'tool',
          toolCallId: tool.id,
          name: tool.name,
          content:
            tool.status === 'denied'
              ? '用户拒绝执行该工具'
              : tool.output || tool.summary || '（无输出）',
          isError: tool.status === 'error' || tool.status === 'denied',
        });
      }
    }
  }

  // 按字符预算保留最近的上下文
  const maxChars = params.maxChars && params.maxChars > 0 ? params.maxChars : MAX_TOTAL_CHARS;
  let total = 0;
  const trimmed: LlmMessage[] = [];
  for (let i = result.length - 1; i >= 0; i--) {
    const msg = result[i];
    const size =
      typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length;
    if (total + size > maxChars && trimmed.length > 0) break;
    total += size;
    trimmed.unshift(msg);
  }
  while (trimmed.length && trimmed[0].role === 'tool') trimmed.shift();
  return trimmed;
}

export function lastUserText(history: LlmMessage[]): string {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== 'user') continue;
    return typeof msg.content === 'string'
      ? msg.content
      : msg.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
  }
  return '';
}
