import { ZodError } from 'zod';
import { getAuth, type AuthContext } from '@/server/auth/session';
import { can } from '@/server/auth/rbac';
import { env } from '@/server/env';
import type { Role } from '@/server/db/schema';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return json({ error: err.message, code: err.code || 'error' }, err.status);
  }
  if (err instanceof ZodError) {
    return json(
      {
        error: '参数校验失败',
        code: 'invalid_argument',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      422,
    );
  }
  console.error('[cuter] 未处理异常', err);
  return json({ error: '服务器内部错误', code: 'internal_error' }, 500);
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const type = req.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    throw new ApiError(415, '请求必须为 application/json', 'unsupported_media_type');
  }
  const text = await req.text();
  if (text.length > 2 * 1024 * 1024) throw new ApiError(413, '请求体过大', 'too_large');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, 'JSON 解析失败', 'invalid_json');
  }
}

export async function requireApi(minRole: Role = 'viewer'): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new ApiError(401, '未登录或会话已过期', 'unauthenticated');
  if (!can(auth.role, minRole)) {
    throw new ApiError(403, '当前角色无权执行该操作', 'forbidden');
  }
  return auth;
}

export function getIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') || '127.0.0.1';
}

/** 同源校验，防御 CSRF（SameSite 之外的第二道防线） */
export function assertSameOrigin(req: Request): void {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return;
  const origin = req.headers.get('origin');
  if (!origin) return; // 非浏览器客户端（API Key）/ 同源表单
  try {
    const originHost = new URL(origin).host;
    const hosts = [
      req.headers.get('host'),
      req.headers.get('x-forwarded-host'),
      (() => {
        try {
          return new URL(env.APP_URL).host;
        } catch {
          return null;
        }
      })(),
    ].filter(Boolean);
    if (hosts.some((host) => host === originHost)) return;
  } catch {
    /* fallthrough */
  }
  throw new ApiError(403, '跨站请求被拒绝', 'csrf_blocked');
}

export function sseResponse(
  handler: (send: (event: string, data: unknown) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          closed = true;
        }
      }, 15_000);
      try {
        await handler(send);
      } catch (err) {
        const message = err instanceof Error ? err.message : '执行失败';
        send('error', { message });
      } finally {
        clearInterval(ping);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

/* ────────── 轻量限流（单实例；集群部署请替换为 Redis 适配器） ────────── */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new ApiError(429, `请求过于频繁，请 ${seconds}s 后重试`, 'rate_limited');
  }
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
}
