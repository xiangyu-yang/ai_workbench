import type { LlmMessage, LlmResult, LlmToolCall, LlmUsage, StreamChatParams } from './types';
import { parseSseData, sseLines } from './sse';

function messagesUrl(baseUrl: string): string {
  const base = (baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  if (base.endsWith('/messages')) return base;
  return base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;
}

type Block = Record<string, unknown>;

function convertMessages(messages: LlmMessage[]): { system: string; messages: Block[] } {
  const systems: string[] = [];
  const out: Block[] = [];

  const pushBlock = (role: 'user' | 'assistant', content: Block[]) => {
    const last = out[out.length - 1];
    if (last && last.role === role) {
      (last.content as Block[]).push(...content);
    } else {
      out.push({ role, content });
    }
  };

  for (const m of messages) {
    if (m.role === 'system') {
      systems.push(m.content);
      continue;
    }
    if (m.role === 'user') {
      const content: Block[] =
        typeof m.content === 'string'
          ? [{ type: 'text', text: m.content }]
          : m.content.map((p) => {
              if (p.type === 'text') return { type: 'text', text: p.text };
              const base64 = p.dataUrl.includes(',') ? p.dataUrl.split(',')[1] : p.dataUrl;
              return { type: 'image', source: { type: 'base64', media_type: p.mime, data: base64 } };
            });
      pushBlock('user', content);
      continue;
    }
    if (m.role === 'assistant') {
      const content: Block[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls || []) {
        content.push({ type: 'tool_use', id: call.id, name: call.name, input: call.args || {} });
      }
      if (!content.length) content.push({ type: 'text', text: '…' });
      pushBlock('assistant', content);
      continue;
    }
    pushBlock('user', [
      {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        content: m.content,
        ...(m.isError ? { is_error: true } : {}),
      },
    ]);
  }

  return { system: systems.join('\n\n'), messages: out };
}

export async function anthropicStream(params: StreamChatParams): Promise<LlmResult> {
  const started = Date.now();
  const { provider, messages, tools, signal, onEvent } = params;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const converted = convertMessages(messages);
  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens || 4096,
    temperature: params.temperature ?? 0.4,
    stream: true,
    messages: converted.messages,
  };
  if (converted.system) body.system = converted.system;
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...(provider.apiKey ? { 'x-api-key': provider.apiKey } : {}),
    ...provider.headers,
  };

  let response: Response;
  try {
    response = await fetch(messagesUrl(provider.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    signal?.removeEventListener('abort', onAbort);
    if (signal?.aborted) throw new Error('已取消');
    throw new Error(`无法连接模型服务：${(err as Error).message}`);
  }

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    signal?.removeEventListener('abort', onAbort);
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      detail = parsed.error?.message || detail;
    } catch {
      /* keep */
    }
    throw new Error(`模型服务返回 ${response.status}：${detail}`);
  }

  let text = '';
  let reasoning = '';
  const usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let finishReason = '';
  let currentIndex = -1;
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();
  const startedCalls = new Set<number>();

  try {
    for await (const line of sseLines(response.body, {
      idleMs: 120_000,
      onIdleAbort: () => controller.abort(),
    })) {
      const data = parseSseData(line);
      if (data == null) continue;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = event.type as string;
      if (type === 'message_start') {
        const msg = event.message as { usage?: { input_tokens?: number } } | undefined;
        usage.inputTokens = msg?.usage?.input_tokens || 0;
      } else if (type === 'content_block_start') {
        currentIndex = (event.index as number) ?? 0;
        const block = event.content_block as Record<string, unknown> | undefined;
        if (block?.type === 'tool_use') {
          const id = String(block.id || `toolu_${currentIndex}`);
          const name = String(block.name || '');
          toolAcc.set(currentIndex, { id, name, args: '' });
          if (name) {
            startedCalls.add(currentIndex);
            onEvent?.({ type: 'tool_start', id, name });
          }
        }
      } else if (type === 'content_block_delta') {
        const index = (event.index as number) ?? currentIndex;
        const delta = (event.delta || {}) as Record<string, unknown>;
        if (delta.type === 'text_delta' && typeof delta.text === 'string') {
          text += delta.text;
          onEvent?.({ type: 'text', delta: delta.text });
        } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
          reasoning += delta.thinking;
          onEvent?.({ type: 'reasoning', delta: delta.thinking });
        } else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const acc = toolAcc.get(index);
          if (acc) acc.args += delta.partial_json;
        }
      } else if (type === 'message_delta') {
        const u = event.usage as { output_tokens?: number } | undefined;
        if (u?.output_tokens) usage.outputTokens = u.output_tokens;
        const delta = event.delta as { stop_reason?: string } | undefined;
        if (delta?.stop_reason) finishReason = delta.stop_reason;
      } else if (type === 'error') {
        const err = event.error as { message?: string } | undefined;
        throw new Error(`模型服务错误：${err?.message || 'unknown'}`);
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  const toolCalls: LlmToolCall[] = [];
  for (const [, acc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
    let args: Record<string, unknown> = {};
    let parseError: string | undefined;
    if (acc.args.trim()) {
      try {
        const parsed = JSON.parse(acc.args);
        args = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
      } catch {
        parseError = '工具参数不是合法 JSON';
      }
    }
    toolCalls.push({ id: acc.id, name: acc.name, args, raw: acc.args, parseError });
  }

  if (!usage.outputTokens) usage.outputTokens = Math.ceil(text.length / 2);
  if (!usage.inputTokens) {
    usage.inputTokens = Math.ceil(
      messages.reduce(
        (acc, m) =>
          acc + (typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length),
        0,
      ) / 3,
    );
  }

  return {
    text,
    reasoning,
    toolCalls,
    usage,
    finishReason: finishReason || (toolCalls.length ? 'tool_use' : 'end_turn'),
    latencyMs: Date.now() - started,
  };
}

export async function anthropicListModels(provider: {
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
}): Promise<string[]> {
  const base = (provider.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  const url = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
  const response = await fetch(url, {
    headers: {
      'anthropic-version': '2023-06-01',
      ...(provider.apiKey ? { 'x-api-key': provider.apiKey } : {}),
      ...provider.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`模型列表获取失败（${response.status}）`);
  const data = (await response.json()) as { data?: Array<{ id?: string }> };
  return (data.data || []).map((m) => m.id).filter((v): v is string => Boolean(v));
}
