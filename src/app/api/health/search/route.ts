import { env } from '@/server/env';
import { webSearchProvider } from '@/server/agent/tools/builtin';

export const dynamic = 'force-dynamic';

/** 搜索服务连通性探针：只检查 SearXNG；Tavily/DDG 不在这里消耗查询额度。 */
export async function GET() {
  const provider = webSearchProvider();
  const started = Date.now();
  if (provider === 'searxng') {
    try {
      const response = await fetch(env.SEARXNG_URL + '/healthz', {
        signal: AbortSignal.timeout(3_000),
      });
      return Response.json(
        {
          status: response.ok ? 'ok' : 'degraded',
          provider,
          upstreamStatus: response.status,
          latencyMs: Date.now() - started,
        },
        { status: response.ok ? 200 : 503 },
      );
    } catch (error) {
      return Response.json(
        {
          status: 'degraded',
          provider,
          error: (error as Error).message,
          latencyMs: Date.now() - started,
        },
        { status: 503 },
      );
    }
  }
  return Response.json({
    status: provider === 'none' ? 'disabled' : 'configured',
    provider,
    latencyMs: Date.now() - started,
  });
}
