import type { LlmMessage, LlmResult, LlmToolCall, LlmUsage, StreamChatParams } from './types';

/**
 * Ollama 原生协议适配器。
 *
 * 相比 Ollama 的 OpenAI 兼容层，原生 /api/chat 支持：
 * - options.num_ctx：为本地模型显式分配上下文，避免默认 4k/8k 被系统提示词与工具定义挤爆后返回空内容；
 * - think：控制 Qwen3 / DeepSeek-R1 等思考模型是否输出思考过程；
 * - message.thinking：稳定的思考流；
 * - message.tool_calls：结构化工具调用。
 */

const DEFAULT_NUM_CTX = 16_384;

export function ollamaNumCtx(): number {
  const value = Number(process.env.OLLAMA_NUM_CTX || DEFAULT_NUM_CTX);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 2_048), 262_144) : DEFAULT_NUM_CTX;
}

export function ollamaThink(): boolean {
  return process.env.OLLAMA_THINK === 'true';
}

function normalizedBase(baseUrl: string): string {
  const raw = /^https?:\/\//i.test(baseUrl || '') ? baseUrl : `http://${baseUrl || '127.0.0.1:11434'}`;
  return raw.replace(/\/+$/, '');
}

/** 显式选择 Ollama，或识别本地 11434 / 服务名里的 ollama。 */
export function isOllamaProvider(provider: { kind: string; baseUrl: string }): boolean {
  if (provider.kind === 'ollama') return true;
  if (provider.kind !== 'openai') return false;
  try {
    const url = new URL(normalizedBase(provider.baseUrl));
    if (url.port === '11434') return true;
    return /(^|\.)ollama($|\.)/i.test(url.hostname);
  } catch {
    return false;
  }
}

function apiRoot(baseUrl: string): string {
  const url = new URL(normalizedBase(baseUrl));
  let prefix = url.pathname.replace(/\/+$/, '');
  if (prefix.endsWith('/v1')) prefix = prefix.slice(0, -3);
  else if (prefix.endsWith('/api')) prefix = prefix.slice(0, -4);
  return `${url.origin}${prefix}`;
}

function toNativeMessages(messages: LlmMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === 'system') return { role: 'system', content: message.content };
    if (message.role === 'user') {
      if (typeof message.content === 'string') return { role: 'user', content: message.content };
      const text = message.content
        .filter((part) => part.type === 'text')
        .map((part) => (part as { text: string }).text)
        .join('');
      const images = message.content
        .filter((part) => part.type === 'image')
        .map((part) => (part as { dataUrl: string }).dataUrl.replace(/^data:[^;]+;base64,/, ''))
        .filter(Boolean);
      return { role: 'user', content: text, ...(images.length ? { images } : {}) };
    }
    if (message.role === 'assistant') {
      const out: Record<string, unknown> = { role: 'assistant', content: message.content || '' };
      if (message.toolCalls?.length) {
        out.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          function: { name: call.name, arguments: call.args || {} },
        }));
      }
      return out;
    }
    return { role: 'tool', content: message.content, tool_name: message.name };
  });
}

type NativeChunk = {
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
    tool_calls?: Array<{
      id?: string;
      function?: { name?: string; arguments?: unknown };
    }>;
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
};

export async function ollamaStream(params: StreamChatParams): Promise<LlmResult> {
  const started = Date.now();
  const { provider, messages, tools, signal, onEvent } = params;

  const body: Record<string, unknown> = {
    model: params.model,
    messages: toNativeMessages(messages),
    stream: true,
    think: ollamaThink(),
    keep_alive: process.env.OLLAMA_KEEP_ALIVE || '30m',
    options: {
      temperature: params.temperature ?? 0.4,
      num_ctx: ollamaNumCtx(),
      ...(params.maxTokens ? { num_predict: params.maxTokens } : {}),
    },
  };
  if (tools?.length) {
    body.tools = tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
    ...provider.headers,
  };

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  const idleTimeoutMs = Math.max(30_000, Number(process.env.OLLAMA_IDLE_TIMEOUT_MS || 180_000));
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, idleTimeoutMs);
  };
  resetIdle();

  let response: Response;
  try {
    response = await fetch(`${apiRoot(provider.baseUrl)}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    signal?.removeEventListener('abort', onAbort);
    if (idleTimer) clearTimeout(idleTimer);
    if (signal?.aborted) throw new Error('已取消');
    if (timedOut) throw new Error(`本地模型超过 ${Math.round(idleTimeoutMs / 1000)} 秒没有输出，请检查 Ollama/显存，或降低上下文`);
    throw new Error(`无法连接本地 Ollama：${(err as Error).message}`);
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    signal?.removeEventListener('abort', onAbort);
    if (idleTimer) clearTimeout(idleTimer);
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text) as { error?: string };
      detail = parsed.error || detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`Ollama 返回 ${response.status}：${detail}`);
  }

  let text = '';
  let reasoning = '';
  let finishReason = '';
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  const toolCalls: LlmToolCall[] = [];
  const seenTools = new Set<string>();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done = false;

  const handleChunk = (chunk: NativeChunk) => {
    if (chunk.error) throw new Error(chunk.error);
    const message = chunk.message;
    if (message) {
      if (message.thinking) {
        reasoning += message.thinking;
        onEvent?.({ type: 'reasoning', delta: message.thinking });
      }
      if (message.content) {
        text += message.content;
        onEvent?.({ type: 'text', delta: message.content });
      }
      for (const call of message.tool_calls || []) {
        const name = call.function?.name || '';
        const id = call.id || `call_${toolCalls.length}_${Date.now()}`;
        if (!name || seenTools.has(id)) continue;
        seenTools.add(id);
        let args: Record<string, unknown> = {};
        const rawArgs = call.function?.arguments;
        if (rawArgs && typeof rawArgs === 'object') {
          args = rawArgs as Record<string, unknown>;
        } else if (typeof rawArgs === 'string' && rawArgs.trim()) {
          try {
            const parsed = JSON.parse(rawArgs) as unknown;
            if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>;
          } catch {
            /* keep empty args; runtime validation will report */
          }
        }
        toolCalls.push({ id, name, args, raw: JSON.stringify(args) });
        onEvent?.({ type: 'tool_start', id, name });
      }
    }
    if (chunk.done) {
      done = true;
      finishReason =
        chunk.done_reason === 'length'
          ? 'length'
          : toolCalls.length
            ? 'tool_calls'
            : 'stop';
      usage = {
        inputTokens: chunk.prompt_eval_count || 0,
        outputTokens: chunk.eval_count || 0,
      };
    }
  };

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      resetIdle();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          handleChunk(JSON.parse(trimmed) as NativeChunk);
        } catch (err) {
          if (err instanceof Error && err.message !== 'Unexpected end of JSON input') throw err;
        }
        if (done) break;
      }
    }
    if (!done && buffer.trim()) {
      handleChunk(JSON.parse(buffer) as NativeChunk);
    }
  } catch (err) {
    if (signal?.aborted) throw new Error('已取消');
    if (timedOut) throw new Error(`本地模型超过 ${Math.round(idleTimeoutMs / 1000)} 秒没有输出，请检查 Ollama/显存，或降低上下文`);
    throw err;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    if (idleTimer) clearTimeout(idleTimer);
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }

  if (!usage.inputTokens && !usage.outputTokens) {
    const approx = messages.reduce((acc, message) => {
      const size =
        typeof message.content === 'string'
          ? message.content.length
          : JSON.stringify(message.content).length;
      return acc + size;
    }, 0);
    usage = { inputTokens: Math.ceil(approx / 3), outputTokens: Math.ceil(text.length / 2) };
  }

  return {
    text,
    reasoning,
    toolCalls,
    usage,
    finishReason: finishReason || (toolCalls.length ? 'tool_calls' : 'stop'),
    latencyMs: Date.now() - started,
  };
}

export async function ollamaEmbeddings(
  provider: { baseUrl: string; apiKey: string; headers: Record<string, string> },
  model: string,
  texts: string[],
): Promise<number[][]> {
  const response = await fetch(`${apiRoot(provider.baseUrl)}/api/embed`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
      ...provider.headers,
    },
    body: JSON.stringify({ model, input: texts, truncate: true }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Ollama embedding ${response.status}：${text.slice(0, 200)}`);
  }
  const data = (await response.json()) as { embeddings?: number[][] };
  return (data.embeddings || []).filter((vector) => Array.isArray(vector) && vector.length > 0);
}

export async function ollamaListModels(provider: { baseUrl: string; apiKey: string; headers: Record<string, string> }): Promise<string[]> {
  const root = apiRoot(provider.baseUrl);
  const response = await fetch(`${root}/api/tags`, {
    headers: {
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
      ...provider.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Ollama 模型列表获取失败（${response.status}）`);
  const data = (await response.json()) as { models?: Array<{ name?: string }> };
  return (data.models || []).map((model) => model.name).filter((v): v is string => Boolean(v));
}
