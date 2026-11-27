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
import { buildSkillPackageTools, normalizeScriptArgs } from '@/server/agent/tools/skill-package';
import { buildStockArtifact, emptyReplyText } from '@/server/agent/loop/report';

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

  it('normalizes bare symbols and drops unsupported market flags', () => {
    expect(normalizeScriptArgs('scripts/daily_trend_scan.py', ['02513.HK'])).toEqual([
      '--symbol',
      '02513.HK',
    ]);
    expect(
      normalizeScriptArgs('scripts/live_market_scan.py', ['--symbol', '02513', '--market', 'hk']),
    ).toEqual(['--symbol', '02513']);
    expect(normalizeScriptArgs('scripts/daily_trend_scan.py', ['--symbol', '02513'])).toEqual([
      '--symbol',
      '02513',
    ]);
  });

  it('auto-resolves a common mistaken skill reference path', async () => {
    const tools = buildSkillPackageTools(
      [
        {
          id: 'sk_daily',
          name: '每日股价趋势分析',
          version: 1,
          body: '',
          references: ['references/intraday-playbook.md'],
          scripts: [],
          assets: [],
          frontmatter: {},
          files: [
            {
              path: 'references/intraday-playbook.md',
              kind: 'reference',
              mime: 'text/markdown',
              size: 2,
              encoding: 'utf8',
              content: '# 日内手册',
            },
          ],
        },
      ],
      { allowScripts: false },
    );
    const read = tools.find((tool) => tool.name === 'skill_read_file');
    const result = await read?.execute(
      { skill: '每日股价趋势分析', path: 'references/volume-price-playbook.md' },
      {} as never,
    );
    expect(result?.isError).not.toBe(true);
    expect(result?.content).toContain('intraday-playbook');
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

describe('report helpers', () => {
  it('builds a daily artifact title and content', () => {
    const result = buildStockArtifact('## 1. 数据状态\n\n内容', {
      userRequest: '小米集团-w 今天走势分析与预测',
      daily: true,
      date: new Date('2026-11-27T00:00:00Z'),
    });
    expect(result.heading).toBe('小米集团-w 每日股价趋势');
    expect(result.name).toContain('2026-11-27.md');
    expect(result.content.startsWith('# ')).toBe(true);
  });

  it('extracts the symbol from an opening request instead of using 马上', () => {
    const result = buildStockArtifact('## 1. 数据状态\n\n内容', {
      userRequest: '马上开盘了，你基于最近的行情帮我提前分析一下智谱02513这只港股未来可能的走势。',
      daily: true,
      date: new Date('2026-11-27T00:00:00Z'),
    });
    expect(result.heading).toContain('智谱');
    expect(result.heading).not.toContain('马上');
  });

  it('uses the first heading for a deep report', () => {
    const result = buildStockArtifact('前言\n\n# 深度研究\n\n正文', {
      userRequest: '分析某公司',
      daily: false,
      date: new Date('2026-11-27T00:00:00Z'),
    });
    expect(result.heading).toBe('深度研究');
    expect(result.content.startsWith('前言')).toBe(false);
  });

  it('builds stable empty-reply diagnostics', () => {
    expect(emptyReplyText({ hasReasoning: true, hasTool: true, lengthLimited: true })).toContain(
      '思考过程',
    );
    expect(emptyReplyText({ hasReasoning: false, hasTool: true, lengthLimited: false })).toContain(
      '工具已执行',
    );
  });
});
