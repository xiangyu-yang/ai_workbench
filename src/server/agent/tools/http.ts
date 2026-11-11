import { fetchText } from '@/server/security/ssrf';
import { stripHtml } from '@/server/rag/extract';
import { truncate } from '@/server/agent/validate';
import type { RuntimeTool } from './types';

export const httpRequestTool: RuntimeTool = {
  name: 'http_request',
  title: '调用外部接口',
  description:
    '向外部 HTTP 接口发起请求（GET/POST/PUT/PATCH/DELETE）。仅用于明确的业务集成，禁止访问内网。',
  dangerous: true,
  parameters: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        description: 'HTTP 方法',
      },
      url: { type: 'string', description: '完整 URL' },
      headers: { type: 'object', description: '请求头（可选）' },
      body: { type: 'string', description: '请求体（可选，JSON 字符串）' },
    },
    required: ['method', 'url'],
  },
  async execute(args) {
    const method = String(args.method || 'GET').toUpperCase();
    const url = String(args.url || '');
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return { content: '不支持的 HTTP 方法', isError: true };
    }
    const headers =
      args.headers && typeof args.headers === 'object'
        ? (args.headers as Record<string, string>)
        : {};
    const result = await fetchText(
      url,
      {
        method,
        headers: { 'content-type': 'application/json', ...headers },
        ...(args.body && method !== 'GET' ? { body: String(args.body) } : {}),
      },
      { maxBytes: 200_000, timeoutMs: 25_000 },
    );
    const isHtml = result.contentType.includes('html');
    const body = isHtml ? stripHtml(result.text) : result.text;
    return {
      content: `HTTP ${result.status} · ${result.contentType || 'unknown'}\n${truncate(body, 15_000)}`,
      summary: `HTTP ${result.status}`,
    };
  },
};
