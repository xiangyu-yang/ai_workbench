import { env } from '@/server/env';
import { fetchText } from '@/server/security/ssrf';
import { stripHtml } from '@/server/rag/extract';
import { evaluateExpression } from '@/server/agent/calculator';
import { truncate } from '@/server/agent/validate';
import type { RuntimeTool } from './types';

export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
};

export function webSearchConfigured(): boolean {
  return Boolean(env.TAVILY_API_KEY || env.SEARXNG_URL || env.WEB_SEARCH_FALLBACK);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

function resultText(html: string): string {
  return decodeHtml(stripHtml(html)).replace(/\s+/g, ' ').trim();
}

function unwrapDuckDuckGoUrl(raw: string): string {
  try {
    const url = new URL(decodeHtml(raw), 'https://duckduckgo.com');
    if (/duckduckgo\.com$/i.test(url.hostname) && url.pathname.startsWith('/l/')) {
      return url.searchParams.get('uddg') || raw;
    }
    return url.toString();
  } catch {
    return raw;
  }
}

export function parseDuckDuckGoResults(html: string, limit = 5): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  const linkPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const blocks: Array<{ href: string; title: string; index: number }> = [];
  for (const match of html.matchAll(linkPattern)) {
    const attrs = match[1] || '';
    if (!/class=["'][^"']*result__a[^"']*["']/i.test(attrs)) continue;
    const href = /href=["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const title = resultText(match[2] || '');
    if (!title) continue;
    blocks.push({ href: unwrapDuckDuckGoUrl(href), title, index: match.index || 0 });
  }
  for (let index = 0; index < blocks.length && results.length < limit; index++) {
    const block = blocks[index];
    const next = blocks[index + 1]?.index ?? html.length;
    const chunk = html.slice(block.index, next);
    const snippetMatch = chunk.match(
      /<a[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
    ) || chunk.match(
      /<div[^>]*class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    );
    results.push({
      title: block.title,
      url: block.href,
      content: snippetMatch ? resultText(snippetMatch[1]) : '',
    });
  }
  return results;
}

async function tavilySearch(query: string, limit: number): Promise<WebSearchResult[]> {
  if (!env.TAVILY_API_KEY) return [];
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
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Tavily ${response.status}`);
  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results || []).slice(0, limit).map((item) => ({
    title: item.title || '未命名',
    url: item.url || '',
    content: item.content || '',
  }));
}

async function searxngSearch(query: string, limit: number): Promise<WebSearchResult[]> {
  if (!env.SEARXNG_URL) return [];
  const url = new URL(env.SEARXNG_URL + '/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'zh-CN');
  const response = await fetch(url, {
    headers: { 'user-agent': 'CuterWorkbench/1.0 web-search' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SearXNG ${response.status}`);
  const data = (await response.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results || []).slice(0, limit).map((item) => ({
    title: item.title || '未命名',
    url: item.url || '',
    content: item.content || '',
  }));
}

async function duckDuckGoSearch(query: string, limit: number): Promise<WebSearchResult[]> {
  if (!env.WEB_SEARCH_FALLBACK) return [];
  const response = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      accept: 'text/html',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`DuckDuckGo ${response.status}`);
  const results = parseDuckDuckGoResults(await response.text(), limit);
  if (!results.length) throw new Error('DuckDuckGo 没有返回可解析结果');
  return results;
}

function searchBody(results: WebSearchResult[], provider: string): string {
  return `<untrusted_data type="web_search" provider="${provider}">\n${results
    .map(
      (item, index) =>
        `[${index + 1}] ${item.title}\nURL: ${item.url}\n${item.content.slice(0, 600)}`,
    )
    .join('\n\n')}\n</untrusted_data>`;
}

export const webSearchTool: RuntimeTool = {
  name: 'web_search',
  title: '联网搜索',
  description:
    '搜索公开互联网获取实时信息。无需 API Key 时使用自建 SearXNG 或 DuckDuckGo 公共页面；返回标题、链接与摘要。',
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
    const limit = Math.min(Math.max(Number(args.max_results) || 5, 1), 8);
    const errors: string[] = [];
    const providers: Array<{ name: string; run: () => Promise<WebSearchResult[]> }> = [
      { name: 'tavily', run: () => tavilySearch(query, limit) },
      { name: 'searxng', run: () => searxngSearch(query, limit) },
      { name: 'duckduckgo', run: () => duckDuckGoSearch(query, limit) },
    ];
    for (const provider of providers) {
      try {
        const results = await provider.run();
        if (!results.length) continue;
        return {
          content: searchBody(results, provider.name),
          summary: `找到 ${results.length} 条结果 · ${provider.name}`,
        };
      } catch (error) {
        errors.push(`${provider.name}: ${(error as Error).message}`);
      }
    }
    return {
      content:
        '联网搜索未获取。可配置 TAVILY_API_KEY 或 SEARXNG_URL；未配置时 DuckDuckGo 公共页面也可能被网络限制。不要重复调用 web_search，请基于已有数据和证据继续，并标注新闻/催化剂未获取。',
      summary: errors.length ? `搜索未获取 (${errors[0]})` : '搜索未获取',
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
