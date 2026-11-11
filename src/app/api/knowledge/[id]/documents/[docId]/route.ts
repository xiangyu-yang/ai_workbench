import { and, eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import { getDb } from '@/server/db/client';
import { chunks, documents } from '@/server/db/schema';
import { refreshKbCounts } from '@/server/rag/ingest';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id, docId } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.orgId, auth.org.id),
          eq(documents.id, docId),
          eq(documents.knowledgeBaseId, id),
        ),
      )
      .limit(1);
    const doc = rows[0];
    if (!doc) throw new ApiError(404, '文档不存在');
    await db.delete(chunks).where(eq(chunks.documentId, docId));
    await db.delete(documents).where(eq(documents.id, docId));
    if (doc.storagePath) await fs.rm(doc.storagePath, { force: true }).catch(() => undefined);
    await refreshKbCounts(auth.org.id, id);
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'knowledge.document.delete',
      { type: 'document', id: docId },
      { name: doc.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
