import type {
  LlmMessage,
  LlmResult,
  LlmToolCall,
  LlmUsage,
  StreamChatParams,
} from './types';
import { parseSseData, sseLines } from './sse';

function chatUrl(baseUrl: string): string {
  const base = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

function convertMessages(messages: LlmMessage[]): unknown[] {
  return messages.map((m) => {
    if (m.role === 'system') return { role: 'system', content: m.content };
    if (m.role === 'user') {
      if (typeof m.content === 'string') return { role: 'user', content: m.content };
      return {
        role: 'user',
        content: m.content.map((p) =>
          p.type === 'text'
            ? { type: 'text', text: p.text }
            : { type: 'image_url', image_url: { url: p.dataUrl } },
        ),
      };
    }
    if (m.role === 'assistant') {
      const out: Record<string, unknown> = { role: 'assistant', content: m.content || null };
      if (m.toolCalls?.length) {
        out.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.raw || JSON.stringify(c.args || {}) },
        }));
      }
      return out;
    }
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  });
}

export async function openaiStream(params: StreamChatParams): Promise<LlmResult> {
  const started = Date.now();
  const { provider, messages, tools, signal, onEvent } = params;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
    ...provider.headers,
  };

  const body: Record<string, unknown> = {
    model: params.model,
    messages: convertMessages(messages),
    stream: true,
    stream_options: { include_usage: true },
    temperature: params.temperature ?? 0.4,
  };
  if (params.maxTokens) body.max_tokens = params.maxTokens;
  if (tools?.length) {
    body.tools = tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = 'auto';
  }

  let response: Response;
  try {
    response = await fetch(chatUrl(provider.baseUrl), {
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
      const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      detail =
        (typeof parsed.error === 'object' ? parsed.error?.message : parsed.error) ||
        parsed.message ||
        detail;
    } catch {
      /* keep raw */
    }
    throw new Error(`模型服务返回 ${response.status}：${detail}`);
  }

  let text = '';
  let reasoning = '';
  let usage: LlmUsage = { inputTokens: 0, outputTokens: 0 };
  let finishReason = '';
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();
  const startedCalls = new Set<number>();

  try {
    for await (const line of sseLines(response.body, {
      idleMs: 120_000,
      onIdleAbort: () => controller.abort(),
    })) {
      const data = parseSseData(line);
      if (data == null) continue;
      if (data === '[DONE]') break;
      let chunk: Record<string, unknown>;
      try {
        chunk = JSON.parse(data) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (chunk.usage) {
        const u = chunk.usage as Record<string, number>;
        usage = {
          inputTokens: u.prompt_tokens ?? u.input_tokens ?? 0,
          outputTokens: u.completion_tokens ?? u.output_tokens ?? 0,
        };
      }
      const choices = chunk.choices as Array<Record<string, unknown>> | undefined;
      const choice = choices?.[0];
      if (!choice) continue;
      if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
      const delta = (choice.delta || {}) as Record<string, unknown>;
      const deltaReasoning = delta.reasoning_content ?? delta.reasoning;
      if (typeof deltaReasoning === 'string' && deltaReasoning) {
        reasoning += deltaReasoning;
        onEvent?.({ type: 'reasoning', delta: deltaReasoning });
      }
      const content = delta.content;
      if (typeof content === 'string' && content) {
        text += content;
        onEvent?.({ type: 'text', delta: content });
      } else if (Array.isArray(content)) {
        for (const part of content) {
          const p = part as { type?: string; text?: string };
          if (p.type === 'text' && p.text) {
            text += p.text;
            onEvent?.({ type: 'text', delta: p.text });
          }
        }
      }
      const calls = delta.tool_calls as
        | Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
        | undefined;
      if (calls) {
        for (const call of calls) {
          const index = call.index ?? 0;
          let acc = toolAcc.get(index);
          if (!acc) {
            acc = { id: call.id || `call_${index}_${Date.now()}`, name: '', args: '' };
            toolAcc.set(index, acc);
          }
          if (call.id) acc.id = call.id;
          if (call.function?.name) acc.name = call.function.name;
          if (call.function?.arguments) acc.args += call.function.arguments;
          if (acc.name && !startedCalls.has(index)) {
            startedCalls.add(index);
            onEvent?.({ type: 'tool_start', id: acc.id, name: acc.name });
          }
        }
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }

  const toolCalls: LlmToolCall[] = [];
  for (const [, acc] of [...toolAcc.entries()].sort((a, b) => a[0] - b[0])) {
    if (!acc.name) continue;
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

  if (usage.inputTokens === 0 && usage.outputTokens === 0) {
    const approx = messages.reduce((acc, m) => {
      const len =
        typeof m.content === 'string' ? m.content.length : JSON.stringify(m.content).length;
      return acc + len;
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

export async function openaiListModels(provider: {
  baseUrl: string;
  apiKey: string;
  headers: Record<string, string>;
}): Promise<string[]> {
  const base = (provider.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const response = await fetch(`${base}/models`, {
    headers: {
      ...(provider.apiKey ? { authorization: `Bearer ${provider.apiKey}` } : {}),
      ...provider.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`模型列表获取失败（${response.status}）`);
  const data = (await response.json()) as { data?: Array<{ id?: string }> };
  return (data.data || []).map((m) => m.id).filter((v): v is string => Boolean(v));
}
