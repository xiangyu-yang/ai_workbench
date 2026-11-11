import type { ModelInfo, ProviderKind } from '@/server/db/schema';

export type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mime: string; dataUrl: string };

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | UserContentPart[] }
  | {
      role: 'assistant';
      content: string;
      reasoning?: string;
      toolCalls?: LlmToolCall[];
    }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

export type LlmToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type LlmToolCall = {
  id: string;
  name: string;
  args: Record<string, unknown>;
  raw?: string;
  parseError?: string;
};

export type LlmStreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_start'; id: string; name: string };

export type LlmUsage = { inputTokens: number; outputTokens: number };

export type LlmResult = {
  text: string;
  reasoning: string;
  toolCalls: LlmToolCall[];
  usage: LlmUsage;
  finishReason: string;
  latencyMs: number;
};

export type ProviderConfig = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
  defaultModel: string;
  embeddingModel: string;
  models: ModelInfo[];
  isVirtual?: boolean;
};

export type ResolvedModel = {
  provider: ProviderConfig;
  model: ModelInfo;
  modelId: string;
};

export type StreamChatParams = {
  provider: ProviderConfig;
  model: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  onEvent?: (event: LlmStreamEvent) => void;
  /** 演示模型可读取的附加上下文 */
  meta?: { mode?: string; hasPlan?: boolean };
};
