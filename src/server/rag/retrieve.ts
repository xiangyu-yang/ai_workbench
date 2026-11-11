import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { chunks, documents, knowledgeBases } from '@/server/db/schema';
import { cosine, embedTexts } from '@/server/llm/embedding';

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  title: string;
  snippet: string;
  content: string;
  ordinal: number;
  score: number;
  vectorScore: number;
  lexicalScore: number;
};

function lexicalTokens(text: string): Set<string> {
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z0-9_]{2,}/g) || [];
  const cjk = lower.match(/[\u4e00-\u9fff]/g) || [];
  const bigrams: string[] = [];
  for (let i = 0; i < cjk.length - 1; i++) bigrams.push(cjk[i] + cjk[i + 1]);
  return new Set([...words, ...bigrams, ...cjk]);
}

function lexicalScore(queryTokens: Set<string>, content: string): number {
  if (!queryTokens.size) return 0;
  const contentTokens = lexicalTokens(content);
  let hit = 0;
  for (const token of queryTokens) if (contentTokens.has(token)) hit += 1;
  return hit / queryTokens.size;
}

/** 混合检索：向量余弦 + 词法覆盖，按知识库分组使用各自的嵌入模型 */
export async function searchKnowledge(params: {
  orgId: string;
  kbIds: string[];
  query: string;
  topK?: number;
  minScore?: number;
}): Promise<RetrievedChunk[]> {
  const { orgId, query } = params;
  const topK = Math.min(Math.max(params.topK ?? 6, 1), 20);
  const minScore = params.minScore ?? 0.06;
  if (!params.kbIds.length || !query.trim()) return [];

  const db = await getDb();
  const kbRows = await db
    .select()
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.orgId, orgId), inArray(knowledgeBases.id, params.kbIds)));
  if (!kbRows.length) return [];

  const groups = new Map<string, { providerId: string | null; model: string; ids: string[] }>();
  for (const kb of kbRows) {
    const key = `${kb.embeddingProviderId || ''}|${kb.embeddingModel || ''}`;
    const existing = groups.get(key);
    if (existing) existing.ids.push(kb.id);
    else
      groups.set(key, {
        providerId: kb.embeddingProviderId,
        model: kb.embeddingModel,
        ids: [kb.id],
      });
  }

  const queryTokens = lexicalTokens(query);
  const results: RetrievedChunk[] = [];

  for (const group of groups.values()) {
    let queryVector: number[] | null = null;
    try {
      const embedded = await embedTexts({
        orgId,
        texts: [query],
        providerId: group.providerId,
        model: group.model,
      });
      queryVector = embedded.vectors[0] || null;
    } catch {
      queryVector = null;
    }

    const rows = await db
      .select({
        chunkId: chunks.id,
        content: chunks.content,
        ordinal: chunks.ordinal,
        embedding: chunks.embedding,
        documentId: documents.id,
        title: documents.name,
      })
      .from(chunks)
      .innerJoin(documents, eq(documents.id, chunks.documentId))
      .where(
        and(eq(chunks.orgId, orgId), inArray(chunks.knowledgeBaseId, group.ids)),
      )
      .limit(6000);

    for (const row of rows) {
      const vectorScore =
        queryVector && row.embedding && row.embedding.length === queryVector.length
          ? Math.max(0, cosine(queryVector, row.embedding))
          : 0;
      const lex = lexicalScore(queryTokens, row.content);
      const score = queryVector ? vectorScore * 0.74 + lex * 0.26 : lex * 0.6;
      if (score < minScore) continue;
      results.push({
        chunkId: row.chunkId,
        documentId: row.documentId,
        title: row.title,
        snippet: row.content.replace(/\s+/g, ' ').slice(0, 400),
        content: row.content,
        ordinal: row.ordinal,
        score,
        vectorScore,
        lexicalScore: lex,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const deduped: RetrievedChunk[] = [];
  for (const item of results) {
    const key = item.content.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= topK) break;
  }
  return deduped;
}

export function buildKnowledgeBlock(results: RetrievedChunk[]): string {
  if (!results.length) return '';
  const body = results
    .map(
      (r, i) =>
        `[${i + 1}] 来源：${r.title}（片段 ${r.ordinal + 1}，相关度 ${(r.score * 100).toFixed(0)}%）\n${r.content}`,
    )
    .join('\n\n---\n\n');
  return `<untrusted_data type="knowledge_base">\n${body}\n</untrusted_data>`;
}
