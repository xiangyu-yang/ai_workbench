import { searchKnowledge } from '@/server/rag/retrieve';
import type { CitationPart } from '@/server/db/schema';
import type { RuntimeTool } from './types';

export const knowledgeSearchTool: RuntimeTool = {
  name: 'knowledge_search',
  title: '检索知识库',
  description:
    '在组织知识库中检索相关资料。回答内部制度、产品文档、历史材料等问题时应优先使用。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '检索问题或关键词' },
      top_k: { type: 'integer', description: '返回片段数，1-12，默认 6' },
    },
    required: ['query'],
  },
  async execute(args, ctx) {
    if (!ctx.kbIds.length) {
      return { content: '当前专家未绑定任何知识库', isError: true };
    }
    const query = String(args.query || '').trim();
    const topK = Math.min(Math.max(Number(args.top_k) || 6, 1), 12);
    const results = await searchKnowledge({
      orgId: ctx.orgId,
      kbIds: ctx.kbIds,
      query,
      topK,
    });
    if (!results.length) {
      return { content: '知识库中未找到相关内容。', summary: '0 条命中' };
    }
    const citations: CitationPart[] = results.map((r, i) => ({
      type: 'citation',
      index: i + 1,
      title: r.title,
      snippet: r.snippet.slice(0, 240),
      source: `片段 ${r.ordinal + 1}`,
      score: Math.round(r.score * 100),
    }));
    const payload = {
      results: results.map((r, i) => ({
        index: i + 1,
        title: r.title,
        source: `片段 ${r.ordinal + 1}`,
        snippet: r.snippet,
        score: Number(r.score.toFixed(3)),
      })),
    };
    return {
      content: `<untrusted_data type="knowledge_base">\n${JSON.stringify(payload, null, 2)}\n</untrusted_data>`,
      summary: `命中 ${results.length} 条片段`,
      citations,
    };
  },
};
