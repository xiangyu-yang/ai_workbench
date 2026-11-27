import { describe, expect, it } from 'vitest';
import {
  dedupeTextParts,
  needsApproval,
  riskOf,
  toAssistantMessage,
  toolTitle,
} from '@/server/agent/loop/helpers';
import type { RuntimeTool } from '@/server/agent/tools/types';
import type { MessagePart } from '@/server/db/schema';

const tool = (name: string, extra: Partial<RuntimeTool> = {}): RuntimeTool => ({
  name,
  description: '',
  parameters: { type: 'object', properties: {} },
  readonly: true,
  execute: async () => ({ content: '' }),
  ...extra,
});

describe('agent loop helpers', () => {
  it('normalizes tool titles', () => {
    expect(toolTitle('mcp_2_search_issues')).toBe('search issues');
    expect(toolTitle('skill_1_2_lookup')).toBe('lookup');
  });

  it('applies approval policy', () => {
    expect(needsApproval(tool('read'), 'never')).toBe(false);
    expect(needsApproval(tool('read', { dangerous: true }), 'dangerous')).toBe(true);
    expect(needsApproval(tool('read', { dangerous: true }), 'never')).toBe(false);
    expect(needsApproval(tool('read'), 'always')).toBe(false);
    expect(needsApproval(tool('write', { readonly: false }), 'always')).toBe(true);
    expect(needsApproval(tool('write', { alwaysApprove: true }), 'never')).toBe(true);
  });

  it('describes risky tools', () => {
    expect(riskOf(tool('workspace_write'))).toContain('写入工作区');
    expect(riskOf(tool('http_request'))).toContain('HTTP');
    expect(riskOf(tool('run_skill_script'))).toContain('技能脚本');
  });

  it('drops duplicate long paragraphs and duplicate text parts', () => {
    const duplicate =
      '这是第一段足够长的内容，用来测试去重逻辑，不能被误删。'.repeat(3);
    const parts: MessagePart[] = [
      { type: 'text', text: `${duplicate}\n\n${duplicate}` },
      { type: 'text', text: duplicate },
    ];
    dedupeTextParts(parts);
    expect(parts).toHaveLength(1);
    expect(parts[0].type).toBe('text');
    expect(parts[0].type === 'text' ? parts[0].text.split('\n\n') : []).toHaveLength(1);
  });

  it('builds an assistant message with tool calls', () => {
    const message = toAssistantMessage([
      { type: 'text', text: '调用工具' },
      {
        type: 'tool',
        id: 'call_1',
        name: 'lookup',
        title: 'lookup',
        status: 'ok',
        args: { q: 'x' },
      },
    ]);
    expect(message?.role).toBe('assistant');
    if (message?.role !== 'assistant') throw new Error('expected assistant message');
    expect(message.content).toBe('调用工具');
    expect(message.toolCalls?.[0]?.name).toBe('lookup');
    expect(toAssistantMessage([])).toBeNull();
  });
});
