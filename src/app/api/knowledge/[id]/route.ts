import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import fs from 'node:fs/promises';
import { getDb } from '@/server/db/client';
import {
  chunks,
  documents,
  expertKnowledgeBases,
  knowledgeBases,
} from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

const PatchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  embeddingProviderId: z.string().nullable().optional(),
  embeddingModel: z.string().max(160).optional(),
  chunkSize: z.number().int().min(300).max(2000).optional(),
  chunkOverlap: z.number().int().min(0).max(500).optional(),
});

async function load(orgId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.orgId, orgId), eq(knowledgeBases.id, id)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, '知识库不存在');
  return rows[0];
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const kb = await load(auth.org.id, id);
    const db = await getDb();
    const docs = await db
      .select({
        id: documents.id,
        name: documents.name,
        mime: documents.mime,
        size: documents.size,
        status: documents.status,
        error: documents.error,
        charCount: documents.charCount,
        chunkCount: documents.chunkCount,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(and(eq(documents.orgId, auth.org.id), eq(documents.knowledgeBaseId, id)))
      .orderBy(asc(documents.createdAt));
    return json({ knowledgeBase: kb, documents: docs });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    await load(auth.org.id, id);
    const input = PatchBody.parse(await readJson(req));
    const db = await getDb();
    await db
      .update(knowledgeBases)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.embeddingProviderId !== undefined
          ? { embeddingProviderId: input.embeddingProviderId || null }
          : {}),
        ...(input.embeddingModel !== undefined ? { embeddingModel: input.embeddingModel } : {}),
        ...(input.chunkSize !== undefined ? { chunkSize: input.chunkSize } : {}),
        ...(input.chunkOverlap !== undefined ? { chunkOverlap: input.chunkOverlap } : {}),
        updatedAt: new Date(),
      })
      .where(eq(knowledgeBases.id, id));
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const kb = await load(auth.org.id, id);
    const db = await getDb();
    const docs = await db
      .select({ storagePath: documents.storagePath })
      .from(documents)
      .where(eq(documents.knowledgeBaseId, id));
    for (const doc of docs) {
      if (doc.storagePath) await fs.rm(doc.storagePath, { force: true }).catch(() => undefined);
    }
    await db.delete(chunks).where(eq(chunks.knowledgeBaseId, id));
    await db.delete(documents).where(eq(documents.knowledgeBaseId, id));
    await db.delete(expertKnowledgeBases).where(eq(expertKnowledgeBases.knowledgeBaseId, id));
    await db.delete(knowledgeBases).where(eq(knowledgeBases.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'knowledge.delete',
      { type: 'knowledge_base', id },
      { name: kb.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
