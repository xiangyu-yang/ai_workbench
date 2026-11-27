import type { LlmMessage, LlmToolCall } from '@/server/llm/types';
import type { MessagePart, ToolPart } from '@/server/db/schema';
import type { RuntimeTool } from '../tools/types';
import { textOfParts } from '../history';

export function dedupeTextParts(parts: MessagePart[]): void {
  const seen = new Set<string>();
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.type !== 'text') continue;
    const paragraphs = part.text.split(/\n{2,}/);
    if (paragraphs.length > 1) {
      const seenParagraphs = new Set<string>();
      const unique = paragraphs.filter((paragraph) => {
        const key = paragraph.replace(/\s+/g, '').trim();
        if (key.length < 60) return true;
        if (seenParagraphs.has(key)) return false;
        seenParagraphs.add(key);
        return true;
      });
      part.text = unique.join('\n\n');
    }
    const normalized = part.text.replace(/\s+/g, '').trim();
    if (normalized.length < 80) continue;
    if (seen.has(normalized)) {
      parts.splice(i, 1);
      i -= 1;
    } else {
      seen.add(normalized);
    }
  }
}

export function riskOf(tool: RuntimeTool): string {
  if (tool.name === 'workspace_write') return '将写入工作区并生成可下载的交付物文件';
  if (tool.name === 'http_request') return '将向外部系统发起 HTTP 请求，可能改变第三方数据';
  if (tool.name.startsWith('mcp_')) return '将调用外部连接器，可能读取或修改第三方系统数据';
  if (tool.name === 'run_skill_script') return '将在隔离目录执行技能脚本，可能产生计算或文件副作用';
  if (tool.name.startsWith('skill_')) return '将调用技能配置的外部接口';
  return '该操作会产生外部副作用';
}

export function needsApproval(tool: RuntimeTool, policy: string): boolean {
  if (tool.alwaysApprove) return true;
  if (policy === 'never') return false;
  if (policy === 'always') return !tool.readonly;
  return Boolean(tool.dangerous);
}

export function toolTitle(name: string): string {
  return name
    .replace(/^mcp_\d+_/, '')
    .replace(/^skill_\d+_\d+_/, '')
    .replace(/_/g, ' ');
}

export function toAssistantMessage(parts: MessagePart[]): LlmMessage | null {
  const text = textOfParts(parts);
  const toolParts = parts.filter((p): p is ToolPart => p.type === 'tool');
  if (!text && !toolParts.length) return null;
  return {
    role: 'assistant',
    content: text,
    toolCalls: toolParts.map(
      (p): LlmToolCall => ({
        id: p.id,
        name: p.name,
        args: (p.args || {}) as Record<string, unknown>,
      }),
    ),
  };
}
