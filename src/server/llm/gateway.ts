import { asc, desc, eq, and } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { modelProviders, type ModelInfo, type ModelProvider } from '@/server/db/schema';
import { decryptSecret } from '@/server/security/crypto';
import { ApiError } from '@/server/http';
import { env } from '@/server/env';
import { openaiListModels, openaiStream } from './openai';
import { anthropicListModels, anthropicStream } from './anthropic';
import { isOllamaProvider, ollamaListModels, ollamaStream } from './ollama';
import { mockStream, MOCK_MODEL } from './mock';
import type { LlmResult, ProviderConfig, ResolvedModel, StreamChatParams } from './types';

export const MOCK_PROVIDER: ProviderConfig = {
  id: 'mock',
  name: '内置演示模型',
  kind: 'mock',
  baseUrl: '',
  apiKey: '',
  headers: {},
  defaultModel: MOCK_MODEL.id,
  embeddingModel: '',
  models: [MOCK_MODEL],
  isVirtual: true,
};

export function toProviderConfig(row: ModelProvider): ProviderConfig {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.baseUrl,
    apiKey: decryptSecret(row.apiKeyEnc),
    headers: row.headers || {},
    defaultModel: row.defaultModel,
    embeddingModel: row.embeddingModel,
    models: row.models || [],
  };
}

export async function listProviderConfigs(orgId: string): Promise<ProviderConfig[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(modelProviders)
    .where(eq(modelProviders.orgId, orgId))
    .orderBy(desc(modelProviders.isDefault), asc(modelProviders.createdAt));
  return rows.map(toProviderConfig);
}

export async function getProvider(orgId: string, id: string): Promise<ProviderConfig | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(modelProviders)
    .where(and(eq(modelProviders.orgId, orgId), eq(modelProviders.id, id)))
    .limit(1);
  return rows[0] ? toProviderConfig(rows[0]) : null;
}

export async function resolveModel(
  orgId: string,
  providerId?: string | null,
  modelId?: string | null,
): Promise<ResolvedModel> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(modelProviders)
    .where(and(eq(modelProviders.orgId, orgId), eq(modelProviders.enabled, true)))
    .orderBy(desc(modelProviders.isDefault), asc(modelProviders.createdAt));

  let row = providerId ? rows.find((r) => r.id === providerId) : undefined;
  if (!row && modelId) {
    row = rows.find(
      (r) =>
        r.defaultModel === modelId ||
        (r.models || []).some((m) => m.id === modelId),
    );
  }
  row = row || rows[0];

  if (!row) {
    if (env.DEMO_MODE) {
      return { provider: MOCK_PROVIDER, model: MOCK_MODEL, modelId: MOCK_MODEL.id };
    }
    throw new ApiError(
      400,
      '尚未配置模型供应商，请管理员在「设置 → 模型供应商」中添加',
      'no_provider',
    );
  }

  const provider = toProviderConfig(row);
  const resolvedId = modelId || provider.defaultModel || provider.models[0]?.id || '';
  const model: ModelInfo =
    provider.models.find((m) => m.id === resolvedId) ||
    (resolvedId
      ? { id: resolvedId, name: resolvedId }
      : { id: provider.defaultModel || 'default', name: provider.defaultModel || '默认模型' });

  return { provider, model, modelId: model.id };
}

export function costOf(model: ModelInfo, inputTokens: number, outputTokens: number): number {
  const input = (model.inputPrice || 0) * (inputTokens / 1_000_000);
  const output = (model.outputPrice || 0) * (outputTokens / 1_000_000);
  return Math.round((input + output) * 1_000_000) / 1_000_000;
}

function retryable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /无法连接|超时|429|500|502|503|504|overloaded|rate.?limit/i.test(message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function streamChat(params: StreamChatParams): Promise<LlmResult> {
  let emitted = false;
  const wrapped: StreamChatParams = {
    ...params,
    onEvent: (event) => {
      emitted = true;
      params.onEvent?.(event);
    },
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (params.provider.kind === 'anthropic') return await anthropicStream(wrapped);
      if (params.provider.kind === 'mock') return await mockStream(wrapped);
      if (isOllamaProvider(params.provider)) return await ollamaStream(wrapped);
      return await openaiStream(wrapped);
    } catch (err) {
      const canRetry = attempt === 0 && !emitted && !params.signal?.aborted && retryable(err);
      if (!canRetry) throw err;
      console.warn('[cuter] 模型调用重试', (err as Error).message.slice(0, 160));
      await sleep(800);
    }
  }
  throw new Error('模型调用失败');
}

export async function listModels(provider: ProviderConfig): Promise<string[]> {
  if (provider.kind === 'mock') return provider.models.map((m) => m.id);
  if (provider.kind === 'anthropic') return anthropicListModels(provider);
  if (provider.kind === 'ollama' || isOllamaProvider(provider)) return ollamaListModels(provider);
  return openaiListModels(provider);
}

export function safeProviders(rows: ModelProvider[]) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.baseUrl,
    models: row.models,
    defaultModel: row.defaultModel,
    embeddingModel: row.embeddingModel,
    enabled: row.enabled,
    isDefault: row.isDefault,
    hasKey: Boolean(row.apiKeyEnc),
    createdAt: row.createdAt,
  }));
}
