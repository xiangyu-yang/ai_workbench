import { getProvider } from './gateway';
import { isOllamaProvider, ollamaEmbeddings } from './ollama';

const LOCAL_DIM = 512;

function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const ascii = lower.match(/[a-z0-9_]{2,}/g) || [];
  const cjkChars = lower.match(/[\u4e00-\u9fff]/g) || [];
  const bigrams: string[] = [];
  for (let i = 0; i < cjkChars.length - 1; i++) bigrams.push(cjkChars[i] + cjkChars[i + 1]);
  return [...ascii, ...cjkChars, ...bigrams];
}

/**
 * 本地确定性嵌入：哈希词袋 + 双哈希符号 + L2 归一化。
 * 无需外部服务即可跑通检索链路；配置嵌入模型后自动切换为语义向量。
 */
export function localEmbed(text: string, dim = LOCAL_DIM): number[] {
  const vec = new Array<number>(dim).fill(0);
  const tokens = tokenize(text);
  if (!tokens.length) return vec;
  const tf = new Map<string, number>();
  for (const token of tokens) tf.set(token, (tf.get(token) || 0) + 1);
  for (const [token, count] of tf) {
    const h1 = hash32(token);
    const h2 = hash32(`${token}#salt`);
    const sign = h2 & 1 ? 1 : -1;
    const weight = 1 + Math.log(count);
    vec[h1 % dim] += weight * sign;
    vec[h2 % dim] += weight * 0.5;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) vec[i] = vec[i] / norm;
  return vec;
}

export function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export type EmbedResult = {
  vectors: number[][];
  model: string;
  providerId: string | null;
  mode: 'remote' | 'local';
};

export async function embedTexts(params: {
  orgId: string;
  texts: string[];
  providerId?: string | null;
  model?: string;
}): Promise<EmbedResult> {
  const { orgId, texts } = params;
  if (!texts.length) return { vectors: [], model: 'local-hash-512', providerId: null, mode: 'local' };

  const provider = params.providerId ? await getProvider(orgId, params.providerId) : null;
  const model = params.model || provider?.embeddingModel || '';

  if (provider && (provider.kind === 'openai' || provider.kind === 'ollama') && model) {
    try {
      const nativeOllama = isOllamaProvider(provider);
      const base = (provider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const vectors: number[][] = [];
      const batchSize = 32;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        if (nativeOllama) {
          vectors.push(...(await ollamaEmbeddings(provider, model, batch)));
          continue;
        }
        const response = await fetch(`${base}/embeddings`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
            ...provider.headers,
          },
          body: JSON.stringify({ model, input: batch }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`embedding ${response.status}`);
        const data = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
        for (const item of data.data || []) {
          if (Array.isArray(item.embedding)) vectors.push(item.embedding);
        }
      }
      if (vectors.length === texts.length && vectors[0].length > 0) {
        return { vectors, model, providerId: provider.id, mode: 'remote' };
      }
      throw new Error('embedding 返回数量不匹配');
    } catch (err) {
      console.warn('[cuter] 远程嵌入失败，回退本地嵌入', (err as Error).message);
    }
  }

  return {
    vectors: texts.map((t) => localEmbed(t)),
    model: `local-hash-${LOCAL_DIM}`,
    providerId: null,
    mode: 'local',
  };
}
