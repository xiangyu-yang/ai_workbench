import dns from 'node:dns/promises';
import net from 'node:net';
import { env } from '@/server/env';

function privateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0) return true;
  if (a >= 224) return true;
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase().split('%')[0];
  if (net.isIPv4(trimmed)) return privateIpv4(trimmed);
  if (!net.isIPv6(trimmed)) return true;
  if (trimmed === '::1' || trimmed === '::') return true;
  if (trimmed.startsWith('fc') || trimmed.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(trimmed)) return true;
  if (trimmed.startsWith('::ffff:')) return privateIpv4(trimmed.slice(7));
  return false;
}

function allowedHost(hostname: string, allowlist: string[]): boolean {
  const all = [...env.TOOL_ALLOWED_HOSTS, ...allowlist];
  return all.some((entry) => {
    const rule = entry.toLowerCase().trim();
    if (!rule) return false;
    if (rule.startsWith('*.')) return hostname.endsWith(rule.slice(1));
    return hostname === rule;
  });
}

/**
 * 出口 URL 校验：协议白名单 + 私网拦截 + DNS 解析校验。
 * 注意：DNS 重绑定需在网关层做 egress 策略，单机版为最佳努力防护。
 */
export async function assertSafeUrl(raw: string, allowlist: string[] = []): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL 格式不正确');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅允许 http/https 协议');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('禁止访问本地或内网地址');
  }
  if (allowedHost(hostname, allowlist)) return url;

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('禁止访问私网地址');
    return url;
  }
  let records: Array<{ address: string }>;
  try {
    records = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error(`域名解析失败：${hostname}`);
  }
  if (!records.length) throw new Error('域名无可解析地址');
  if (records.some((r) => isPrivateIp(r.address))) throw new Error('域名解析到私网地址，已拦截');
  return url;
}

export type FetchTextResult = { text: string; contentType: string; finalUrl: string; status: number };

export async function fetchText(
  rawUrl: string,
  init: RequestInit = {},
  opts: { maxBytes?: number; timeoutMs?: number; allowlist?: string[] } = {},
): Promise<FetchTextResult> {
  const maxBytes = opts.maxBytes ?? 240_000;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const allowlist = opts.allowlist ?? [];
  let current = rawUrl;

  for (let hop = 0; hop < 4; hop++) {
    await assertSafeUrl(current, allowlist);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(current, {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'user-agent': 'CuterBot/1.0 (+https://cuter.local)',
          accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.5',
          ...(init.headers as Record<string, string> | undefined),
        },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw new Error('重定向缺少 Location');
        current = new URL(location, current).toString();
        continue;
      }
      if (!response.ok) throw new Error(`目标站点返回 ${response.status}`);
      if (!response.body) return { text: '', contentType: '', finalUrl: current, status: response.status };

      const contentType = response.headers.get('content-type') || '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let text = '';
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) {
          text += decoder.decode(value, { stream: true });
          await reader.cancel();
          break;
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return { text: text.slice(0, maxBytes), contentType, finalUrl: current, status: response.status };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('重定向次数过多');
}
