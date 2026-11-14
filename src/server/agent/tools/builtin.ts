import { env } from '@/server/env';
import { fetchText } from '@/server/security/ssrf';
import { stripHtml } from '@/server/rag/extract';
import { evaluateExpression } from '@/server/agent/calculator';
import { truncate } from '@/server/agent/validate';
import type { RuntimeTool } from './types';

export const webSearchTool: RuntimeTool = {
  name: 'web_search',
  title: '联网搜索',
  description: '搜索公开互联网获取实时信息。返回标题、链接与摘要。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词，尽量具体' },
      max_results: { type: 'integer', description: '返回条数，1-8', minimum: 1, maximum: 8 },
    },
    required: ['query'],
  },
  async execute(args) {
    const query = String(args.query || '').trim();
    if (!query) return { content: '搜索关键词为空', isError: true };
    if (!env.TAVILY_API_KEY) {
      return {
        content:
          '联网搜索未配置。请管理员在环境变量中设置 TAVILY_API_KEY 后重试；当前可改用知识库或 read_url 工具。',
        isError: true,
        summary: '未配置搜索服务',
      };
    }
    const limit = Math.min(Math.max(Number(args.max_results) || 5, 1), 8);
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: env.TAVILY_API_KEY,
        query,
        max_results: limit,
        search_depth: 'basic',
        include_answer: false,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) {
      return { content: `搜索服务返回 ${response.status}`, isError: true };
    }
    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const results = (data.results || []).slice(0, limit);
    if (!results.length) return { content: '没有找到相关结果', summary: '0 条结果' };
    const body = results
      .map(
        (r, i) =>
          `[${i + 1}] ${r.title || '未命名'}\nURL: ${r.url || ''}\n${(r.content || '').slice(0, 600)}`,
      )
      .join('\n\n');
    return {
      content: `<untrusted_data type="web_search">\n${body}\n</untrusted_data>`,
      summary: `找到 ${results.length} 条结果`,
    };
  },
};

export const readUrlTool: RuntimeTool = {
  name: 'read_url',
  title: '读取网页',
  description: '抓取指定网页并提取正文，用于阅读原文或核实信息。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '完整的 http/https 链接' },
    },
    required: ['url'],
  },
  async execute(args) {
    const url = String(args.url || '').trim();
    if (!url) return { content: 'URL 为空', isError: true };
    const result = await fetchText(
      url,
      { method: 'GET' },
      { maxBytes: 300_000, timeoutMs: 20_000 },
    );
    const isHtml = result.contentType.includes('html');
    const text = isHtml ? stripHtml(result.text) : result.text;
    const titleMatch = result.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]).slice(0, 120) : '';
    return {
      content: `<untrusted_data type="web_page" url="${result.finalUrl}">\n${truncate(text, 20_000)}\n</untrusted_data>`,
      summary: `${title || '网页'} · ${(text.length / 1000).toFixed(1)}k 字`,
    };
  },
};

export const calculatorTool: RuntimeTool = {
  name: 'calculator',
  title: '计算器',
  description: '精确计算数学表达式，支持 + - * / % ^、括号与 sqrt/abs/round/min/max/pow/log。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: '例如 (128*3+56)/4 或 sqrt(144)' },
    },
    required: ['expression'],
  },
  async execute(args) {
    const expression = String(args.expression || '');
    try {
      const value = evaluateExpression(expression);
      return { content: `${expression} = ${value}`, summary: String(value) };
    } catch (err) {
      return { content: `计算失败：${(err as Error).message}`, isError: true };
    }
  },
};
