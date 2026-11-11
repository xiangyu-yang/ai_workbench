import { z } from 'zod';
import { requireApiKey } from '@/server/auth/api-key';
import { errorResponse, json, readJson } from '@/server/http';
import { searchKnowledge } from '@/server/rag/retrieve';

const Body = z.object({
  query: z.string().trim().min(1).max(2000),
  topK: z.number().int().min(1).max(20).default(6),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const key = await requireApiKey(req, 'read');
    const { id } = await ctx.params;
    const body = Body.parse(await readJson(req));
    const results = await searchKnowledge({
      orgId: key.orgId,
      kbIds: [id],
      query: body.query,
      topK: body.topK,
    });
    return json({
      results: results.map((r) => ({
        title: r.title,
        snippet: r.snippet,
        score: Number(r.score.toFixed(4)),
        documentId: r.documentId,
        ordinal: r.ordinal,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
