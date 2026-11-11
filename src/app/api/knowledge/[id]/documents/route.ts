import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { knowledgeBases } from '@/server/db/schema';
import { ingestDocument } from '@/server/rag/ingest';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  rateLimit,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    rateLimit(`ingest:${auth.user.id}`, 20, 60_000);

    const db = await getDb();
    const rows = await db
      .select()
      .from(knowledgeBases)
      .where(and(eq(knowledgeBases.orgId, auth.org.id), eq(knowledgeBases.id, id)))
      .limit(1);
    if (!rows[0]) throw new ApiError(404, '知识库不存在');

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, '缺少文件');

    const result = await ingestDocument({
      orgId: auth.org.id,
      knowledgeBaseId: id,
      name: file.name,
      mime: file.type || 'application/octet-stream',
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'knowledge.ingest',
      { type: 'document', id: result.documentId },
      { name: file.name, chunks: result.chunkCount },
    );
    return json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err);
  }
}
