import fs from 'node:fs/promises';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { chunks, documents, knowledgeBases } from '@/server/db/schema';
import { DATA_DIR } from '@/server/env';
import { newId } from '@/server/ids';
import { embedTexts } from '@/server/llm/embedding';
import { ApiError } from '@/server/http';
import { chunkText } from './chunk';
import { extractText } from './extract';

function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000]/g, '_').slice(0, 120) || 'document';
}

export async function ingestDocument(params: {
  orgId: string;
  knowledgeBaseId: string;
  name: string;
  mime: string;
  buffer: Buffer;
}): Promise<{ documentId: string; chunkCount: number; charCount: number }> {
  const { orgId, knowledgeBaseId, buffer } = params;
  if (!buffer.length) throw new ApiError(400, '文件为空');
  if (buffer.byteLength > 15 * 1024 * 1024) throw new ApiError(413, '文件超过 15MB 限制');

  const db = await getDb();
  const kbRows = await db
    .select()
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.orgId, orgId), eq(knowledgeBases.id, knowledgeBaseId)))
    .limit(1);
  const kb = kbRows[0];
  if (!kb) throw new ApiError(404, '知识库不存在');

  const documentId = newId('doc');
  const fileName = sanitizeName(params.name);
  const dir = path.join(DATA_DIR, 'uploads', orgId);
  await fs.mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, `${documentId}-${fileName}`);
  await fs.writeFile(storagePath, buffer);

  await db.insert(documents).values({
    id: documentId,
    orgId,
    knowledgeBaseId,
    name: fileName,
    mime: params.mime || 'application/octet-stream',
    size: buffer.byteLength,
    storagePath,
    status: 'processing',
  });

  try {
    const text = await extractText({ buffer, mime: params.mime, name: fileName });
    if (!text.trim()) throw new Error('未能从文件中提取到文本内容');
    const pieces = chunkText(text, { size: kb.chunkSize, overlap: kb.chunkOverlap });
    if (!pieces.length) throw new Error('文档内容为空');

    const embedded = await embedTexts({
      orgId,
      texts: pieces,
      providerId: kb.embeddingProviderId,
      model: kb.embeddingModel,
    });

    const rows = pieces.map((content, index) => ({
      id: newId('chk'),
      orgId,
      knowledgeBaseId,
      documentId,
      ordinal: index,
      content,
      embedding: embedded.vectors[index] || null,
      meta: { model: embedded.model, mode: embedded.mode, chars: content.length },
    }));
    for (let i = 0; i < rows.length; i += 100) {
      await db.insert(chunks).values(rows.slice(i, i + 100));
    }

    await db
      .update(documents)
      .set({
        status: 'ready',
        charCount: text.length,
        chunkCount: rows.length,
        error: '',
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));

    await refreshKbCounts(orgId, knowledgeBaseId);
    return { documentId, chunkCount: rows.length, charCount: text.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : '解析失败';
    await db
      .update(documents)
      .set({ status: 'failed', error: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(documents.id, documentId));
    await refreshKbCounts(orgId, knowledgeBaseId);
    throw new ApiError(422, `文档处理失败：${message}`, 'ingest_failed');
  }
}

export async function refreshKbCounts(orgId: string, knowledgeBaseId: string): Promise<void> {
  const db = await getDb();
  const docRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.knowledgeBaseId, knowledgeBaseId)));
  const chunkRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(chunks)
    .where(and(eq(chunks.orgId, orgId), eq(chunks.knowledgeBaseId, knowledgeBaseId)));
  await db
    .update(knowledgeBases)
    .set({
      docCount: Number(docRows[0]?.count || 0),
      chunkCount: Number(chunkRows[0]?.count || 0),
      updatedAt: new Date(),
    })
    .where(and(eq(knowledgeBases.orgId, orgId), eq(knowledgeBases.id, knowledgeBaseId)));
}
