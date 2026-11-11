import { z } from 'zod';
import { searchKnowledge } from '@/server/rag/retrieve';
import {
  assertSameOrigin,
  errorResponse,
  json,
  rateLimit,
  readJson,
  requireApi,
} from '@/server/http';

const Body = z.object({
  query: z.string().trim().min(1).max(2000),
  topK: z.number().int().min(1).max(12).default(5),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const body = Body.parse(await readJson(req));
    rateLimit(`kb-search:${auth.user.id}`, 60, 60_000);
    const started = Date.now();
    const results = await searchKnowledge({
      orgId: auth.org.id,
      kbIds: [id],
      query: body.query,
      topK: body.topK,
    });
    return json({
      results: results.map((r) => ({
        documentId: r.documentId,
        title: r.title,
        snippet: r.snippet,
        content: r.content.slice(0, 1200),
        score: Number(r.score.toFixed(3)),
        vectorScore: Number(r.vectorScore.toFixed(3)),
        lexicalScore: Number(r.lexicalScore.toFixed(3)),
        ordinal: r.ordinal,
      })),
      tookMs: Date.now() - started,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
