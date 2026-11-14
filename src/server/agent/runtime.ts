import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import {
  approvals,
  expertKnowledgeBases,
  experts,
  messages,
  threads,
  type Approval,
  type Expert,
  type MessagePart,
  type MessageStatus,
  type SkillPart,
  type ReasoningPart,
  type TextPart,
  type ToolPart,
} from '@/server/db/schema';
import { audit } from '@/server/audit';
import { createArtifact } from '@/server/artifacts';
import { newId } from '@/server/ids';
import { costOf, resolveModel, streamChat } from '@/server/llm/gateway';
import { isOllamaProvider, ollamaNumCtx } from '@/server/llm/ollama';
import { buildKnowledgeBlock, searchKnowledge } from '@/server/rag/retrieve';
import { createRun, finishRun, recordUsage } from '@/server/usage';
import type { LlmMessage, LlmToolCall, ProviderConfig, ResolvedModel } from '@/server/llm/types';
import type { ModelInfo } from '@/server/db/schema';
import type { Emit, RuntimeEvent } from './events';
import { buildHistory, lastUserText, textOfParts } from './history';
import { buildSystemPrompt } from './prompt';
import { buildToolset, type AgentMode } from './tools';
import type { RuntimeTool, ToolContext, ToolResult } from './tools/types';
import { validateArgs, truncate } from './validate';

function dedupeTextParts(parts: MessagePart[]): void {
  const seen = new Set<string>();
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (part.type !== 'text') continue;
    const paragraphs = part.text.split(/\n{2,}/);
    if (paragraphs.length > 1) {
      const seenParagraphs = new Set<string>();
      const unique = paragraphs.filter((paragraph) => {
        const key = paragraph.replace(/\s+/g, '').trim();
        if (key.length < 60) return true;
        if (seenParagraphs.has(key)) return false;
        seenParagraphs.add(key);
        return true;
      });
      part.text = unique.join('\n\n');
    }
    const normalized = part.text.replace(/\s+/g, '').trim();
    if (normalized.length < 80) continue;
    if (seen.has(normalized)) {
      parts.splice(i, 1);
      i -= 1;
    } else {
      seen.add(normalized);
    }
  }
}

export type RunParams = {
  orgId: string;
  userId: string;
  threadId: string;
  messageId: string;
  mode?: AgentMode;
  signal?: AbortSignal;
  emit: Emit;
  resume?: boolean;
  taskId?: string | null;
  depth?: number;
  skillIds?: string[] | null;
};

export type RunOutcome = {
  status: MessageStatus;
  content: string;
  inputTokens: number;
  outputTokens: number;
  error?: string;
};

const POLICY_LABEL: Record<string, string> = {
  never: '自动执行',
  dangerous: '危险操作需审批',
  always: '逐动作审批',
};

function riskOf(tool: RuntimeTool): string {
  if (tool.name === 'workspace_write') return '将写入工作区并生成可下载的交付物文件';
  if (tool.name === 'http_request') return '将向外部系统发起 HTTP 请求，可能改变第三方数据';
  if (tool.name.startsWith('mcp_')) return '将调用外部连接器，可能读取或修改第三方系统数据';
  if (tool.name === 'run_skill_script') return '将在隔离目录执行技能脚本，可能产生计算或文件副作用';
  if (tool.name.startsWith('skill_')) return '将调用技能配置的外部接口';
  return '该操作会产生外部副作用';
}

function needsApproval(tool: RuntimeTool, policy: string): boolean {
  if (tool.alwaysApprove) return true;
  if (policy === 'never') return false;
  if (policy === 'always') return !tool.readonly;
  return Boolean(tool.dangerous);
}

function toolTitle(name: string): string {
  return name
    .replace(/^mcp_\d+_/, '')
    .replace(/^skill_\d+_\d+_/, '')
    .replace(/_/g, ' ');
}

async function loadExpert(orgId: string, expertId?: string | null): Promise<Expert | null> {
  if (!expertId) return null;
  const db = await getDb();
  const rows = await db
    .select()
    .from(experts)
    .where(and(eq(experts.orgId, orgId), eq(experts.id, expertId)))
    .limit(1);
  return rows[0] || null;
}

async function kbIdsOf(orgId: string, expert: Expert | null): Promise<string[]> {
  if (!expert) return [];
  const db = await getDb();
  const rows = await db
    .select({ id: expertKnowledgeBases.knowledgeBaseId })
    .from(expertKnowledgeBases)
    .where(and(eq(expertKnowledgeBases.orgId, orgId), eq(expertKnowledgeBases.expertId, expert.id)));
  return rows.map((r) => r.id);
}

function toAssistantMessage(parts: MessagePart[]): LlmMessage | null {
  const text = textOfParts(parts);
  const toolParts = parts.filter(
    (p): p is ToolPart => p.type === 'tool',
  );
  if (!text && !toolParts.length) return null;
  return {
    role: 'assistant',
    content: text,
    toolCalls: toolParts.map((p) => ({
      id: p.id,
      name: p.name,
      args: (p.args || {}) as Record<string, unknown>,
    })),
  };
}

export async function runAgent(params: RunParams): Promise<RunOutcome> {
  const db = await getDb();
  const threadRows = await db
    .select()
    .from(threads)
    .where(and(eq(threads.orgId, params.orgId), eq(threads.id, params.threadId)))
    .limit(1);
  const thread = threadRows[0];
  if (!thread) throw new Error('会话不存在');

  const assistantRows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.orgId, params.orgId), eq(messages.id, params.messageId)))
    .limit(1);
  const assistant = assistantRows[0];
  if (!assistant) throw new Error('消息不存在');

  const expert = await loadExpert(params.orgId, thread.expertId);
  const mode: AgentMode = params.mode || (thread.mode as AgentMode) || 'agent';
  const policy = expert?.toolPolicy || (mode === 'task' ? 'never' : 'dangerous');
  const kbIds = await kbIdsOf(params.orgId, expert);

  let resolved: ResolvedModel;
  try {
    resolved = await resolveModel(params.orgId, expert?.providerId, expert?.modelId);
  } catch (err) {
    const message = (err as Error).message;
    await db
      .update(messages)
      .set({ status: 'error', error: message, parts: assistant.parts })
      .where(eq(messages.id, assistant.id));
    await params.emit({ type: 'error', message });
    await params.emit({
      type: 'done',
      messageId: assistant.id,
      status: 'error',
      content: '',
    });
    return { status: 'error', content: '', inputTokens: 0, outputTokens: 0, error: message };
  }

  const runId = await createRun({
    orgId: params.orgId,
    threadId: params.threadId,
    messageId: params.messageId,
    taskId: params.taskId,
    expertId: expert?.id,
    providerId: resolved.provider.id,
    model: resolved.modelId,
  });
  await db.update(messages).set({ runId, status: 'streaming' }).where(eq(messages.id, assistant.id));

  const startedAt = Date.now();
  let parts: MessagePart[] = Array.isArray(assistant.parts) ? [...assistant.parts] : [];
  let baseIn = assistant.inputTokens || 0;
  let baseOut = assistant.outputTokens || 0;
  let runIn = 0;
  let runOut = 0;
  let steps = 0;
  let finished = false;
  const emitQueue: Promise<void>[] = [];

  const send = (event: RuntimeEvent) => {
    const p = Promise.resolve(params.emit(event)).catch((err) => {
      console.error('[cuter] 事件推送失败', err);
    });
    emitQueue.push(p);
  };

  const flush = async () => {
    await Promise.allSettled(emitQueue.splice(0));
  };

  send({
    type: 'meta',
    runId,
    messageId: assistant.id,
    threadId: params.threadId,
    taskId: params.taskId || undefined,
  });

  const recentUserRows = await db
    .select({ parts: messages.parts })
    .from(messages)
    .where(
      and(
        eq(messages.orgId, params.orgId),
        eq(messages.threadId, params.threadId),
        eq(messages.role, 'user'),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  const skillQuery = recentUserRows[0]
    ? textOfParts(recentUserRows[0].parts || [])
    : thread.title;
  const effectiveSkillIds = params.skillIds !== undefined ? params.skillIds : thread.skillIds;
  const toolset = await buildToolset({
    orgId: params.orgId,
    expert,
    mode,
    kbIds,
    taskId: params.taskId,
    depth: params.depth || 0,
    query: skillQuery,
    skillIds: effectiveSkillIds,
  });
  const existingSkillIds = new Set(
    parts.filter((part): part is SkillPart => part.type === 'skill').map((part) => part.id),
  );
  for (const skill of toolset.skills.filter((item) => item.full || item.selection === 'manual')) {
    if (existingSkillIds.has(skill.id)) continue;
    const part: SkillPart = {
      type: 'skill',
      id: skill.id,
      name: skill.name,
      version: skill.version,
      selection: skill.selection,
      fileCount: skill.fileCount,
      referenceCount: skill.referenceCount,
      scriptCount: skill.scriptCount,
      description: skill.description,
    };
    parts.push(part);
    send({ type: 'skill', part });
  }
  const toolMap = new Map(toolset.tools.map((t) => [t.name, t]));
  // 兼容模型常见的工具名颠倒写法，避免一次无效重试被展示成执行失败。
  const readSkillFile = toolMap.get('skill_read_file');
  if (readSkillFile && !toolMap.has('read_skill_file')) {
    toolMap.set('read_skill_file', readSkillFile);
  }
  const toolCallCounts = new Map<string, number>();
  let loopGuard = false;
  const stockResearch = toolset.skills.some((skill) => skill.name.includes('股票深度分析'));
  const blockedStockTools = new Set(['read_url', 'fetch_url', 'http_request']);
  if (!process.env.TAVILY_API_KEY) blockedStockTools.add('web_search');

  let llmMessages: LlmMessage[] = [];
  let systemPrompt = '';

  // 自动召回（仅首轮，减少后续延迟）
  const localHistoryChars = isOllamaProvider(resolved.provider)
    ? Math.max(4_000, Math.floor(ollamaNumCtx() * 0.45))
    : undefined;
  const preHistory = await buildHistory({
    orgId: params.orgId,
    threadId: params.threadId,
    excludeMessageId: params.messageId,
    maxChars: localHistoryChars,
  });
  const userTurns = preHistory.filter((m) => m.role === 'user').length;
  const autoQuery = lastUserText(preHistory);
  let knowledgeBlock = '';
  if (kbIds.length && userTurns <= 1 && autoQuery.trim().length > 4) {
    try {
      const retrieved = await searchKnowledge({
        orgId: params.orgId,
        kbIds,
        query: autoQuery,
        topK: 5,
      });
      if (retrieved.length) {
        knowledgeBlock = buildKnowledgeBlock(retrieved);
        const existingCitations = parts.filter((p) => p.type === 'citation').length;
        if (!existingCitations) {
          for (const [index, item] of retrieved.entries()) {
            const citation = {
              type: 'citation' as const,
              index: index + 1,
              title: item.title,
              source: `片段 ${item.ordinal + 1}`,
              snippet: item.snippet.slice(0, 240),
              score: Math.round(item.score * 100),
            };
            parts.push(citation);
            send({ type: 'citation', citation });
          }
        }
      }
    } catch (err) {
      console.warn('[cuter] 自动召回失败', err);
    }
  }

  const orgNameRows = await db.execute(
    sql`select name from orgs where id = ${params.orgId} limit 1`,
  );
  const orgName =
    (orgNameRows as unknown as { rows?: Array<{ name?: string }> }).rows?.[0]?.name || '组织';

  systemPrompt = buildSystemPrompt({
    orgName,
    expert,
    mode,
    skillInstructions: toolset.instructions,
    knowledge: knowledgeBlock,
    task: params.taskId ? { title: thread.title, goal: thread.title } : null,
    depth: params.depth || 0,
  });

  const toolCtx: ToolContext = {
    orgId: params.orgId,
    userId: params.userId,
    expertId: expert?.id,
    threadId: params.threadId,
    taskId: params.taskId,
    messageId: params.messageId,
    runId,
    scopeId: params.threadId,
    mode,
    signal: params.signal,
    emit: (event) => send(event),
    kbIds,
    delegate: async (expertId, goal) => delegateToExpert(params, expertId, goal),
  };

  let lastPersist = 0;
  let saving: Promise<void> = Promise.resolve();

  const persist = async (status?: MessageStatus) => {
    const content = textOfParts(parts);
    await db
      .update(messages)
      .set({
        parts,
        content,
        status: status || 'streaming',
        model: resolved.modelId,
        providerId: resolved.provider.id,
        inputTokens: baseIn + runIn,
        outputTokens: baseOut + runOut,
        error: '',
      })
      .where(eq(messages.id, assistant.id));
  };

  const schedulePersist = (force = false) => {
    const now = Date.now();
    if (!force && now - lastPersist < 1200) return;
    lastPersist = now;
    const snapshot = parts.map((p) => ({ ...p }));
    const content = textOfParts(snapshot);
    saving = saving.then(async () => {
      await db
        .update(messages)
        .set({
          parts: snapshot,
          content,
          inputTokens: baseIn + runIn,
          outputTokens: baseOut + runOut,
          model: resolved.modelId,
          providerId: resolved.provider.id,
        })
        .where(eq(messages.id, assistant.id))
        .catch((err) => console.error('[cuter] 消息持久化失败', err));
    });
  };

  const executeTool = async (call: LlmToolCall, tool: RuntimeTool | undefined): Promise<ToolResult> => {
    if (!tool) return { content: `未知工具：${call.name}`, isError: true };
    if (stockResearch && blockedStockTools.has(call.name)) {
      return {
        content:
          '股票研究禁止抓取财经网页或调用外部 HTTP 接口。请使用 live_market_scan / fetch_fundamentals 的结构化结果；数据缺失时直接说明缺口。',
        isError: true,
      };
    }
    if (call.parseError) return { content: `工具参数解析失败：${call.parseError}`, isError: true };
    const validated = validateArgs(tool.parameters, call.args);
    if (!validated.ok) {
      return { content: `工具参数校验失败：${validated.errors.join('；')}`, isError: true };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    const onAbort = () => controller.abort();
    params.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const result = await tool.execute(validated.value, { ...toolCtx, signal: controller.signal });
      const cap =
        call.name === 'run_skill_script' ? 12_000 : call.name === 'skill_read_file' ? 8_000 : call.name === 'web_search' ? 4_000 : 6_000;
      return { ...result, content: truncate(result.content, cap) };
    } catch (err) {
      return {
        content: `工具执行失败：${(err as Error).message || '未知错误'}`,
        isError: true,
        summary: '执行失败',
      };
    } finally {
      clearTimeout(timer);
      params.signal?.removeEventListener('abort', onAbort);
    }
  };

  const finalize = async (
    status: MessageStatus,
    error = '',
  ): Promise<RunOutcome> => {
    finished = true;
    const content = textOfParts(parts);
    await saving.catch(() => undefined);
    await db
      .update(messages)
      .set({
        parts,
        content,
        status,
        model: resolved.modelId,
        providerId: resolved.provider.id,
        inputTokens: baseIn + runIn,
        outputTokens: baseOut + runOut,
        runId,
        error,
      })
      .where(eq(messages.id, assistant.id));
    await db
      .update(threads)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(threads.id, params.threadId));
    if (expert) {
      await db
        .update(experts)
        .set({ usageCount: sql`${experts.usageCount} + 1` })
        .where(eq(experts.id, expert.id))
        .catch(() => undefined);
    }

    const cost = costOf(resolved.model, runIn, runOut);
    send({ type: 'usage', inputTokens: runIn, outputTokens: runOut, costUsd: cost });
    send({ type: 'parts', parts });
    send({ type: 'status', status });
    send({ type: 'done', messageId: assistant.id, status, content });
    await flush();

    await finishRun({
      runId,
      status:
        status === 'completed'
          ? 'ok'
          : status === 'awaiting_approval'
            ? 'awaiting_approval'
            : status === 'cancelled'
              ? 'cancelled'
              : 'error',
      inputTokens: runIn,
      outputTokens: runOut,
      costUsd: cost,
      latencyMs: Date.now() - startedAt,
      steps,
      error,
    });
    if (runIn || runOut) {
      await recordUsage({
        orgId: params.orgId,
        providerId: resolved.provider.id,
        model: resolved.modelId,
        inputTokens: runIn,
        outputTokens: runOut,
        costUsd: cost,
      });
    }
    return {
      status,
      content,
      inputTokens: runIn,
      outputTokens: runOut,
      error: error || undefined,
    };
  };

  // 恢复：先补齐待审批/待执行的工具
  if (params.resume) {
    const pending = parts.filter(
      (p): p is ToolPart => p.type === 'tool' && p.status === 'pending_approval',
    );
    if (pending.length) {
      const dbApprovals = await db
        .select()
        .from(approvals)
        .where(and(eq(approvals.orgId, params.orgId), eq(approvals.messageId, assistant.id)));
      const stillPending = pending.some((p) => {
        if (!p.approvalId) return false;
        const row = dbApprovals.find((a) => a.id === p.approvalId);
        return !row || row.status === 'pending';
      });
      if (stillPending) {
        await finalize('awaiting_approval');
        return {
          status: 'awaiting_approval',
          content: textOfParts(parts),
          inputTokens: runIn,
          outputTokens: runOut,
        };
      }
    }

    llmMessages = preHistory;
    const assistantMsg = toAssistantMessage(parts);
    if (assistantMsg) llmMessages.push(assistantMsg);

    for (const part of parts) {
      if (part.type !== 'tool' || part.status !== 'pending_approval') {
        if (part.type === 'tool' && part.status !== 'pending_approval') {
          llmMessages.push({
            role: 'tool',
            toolCallId: part.id,
            name: part.name,
            content: part.output || part.summary || '',
            isError: part.status === 'error' || part.status === 'denied',
          });
        }
        continue;
      }
      let decision: Approval | undefined;
      if (part.approvalId) {
        decision = (
          await db.select().from(approvals).where(eq(approvals.id, part.approvalId)).limit(1)
        )[0];
      }
      const denied = decision?.status === 'denied' || decision?.status === 'expired';
      if (denied) {
        part.status = 'denied';
        part.output = '用户拒绝执行该操作';
        part.summary = '已拒绝';
        llmMessages.push({
          role: 'tool',
          toolCallId: part.id,
          name: part.name,
          content: '用户拒绝执行该操作，请尊重该决定并总结当前进展。',
          isError: true,
        });
        send({
          type: 'tool_result',
          id: part.id,
          name: part.name,
          status: 'denied',
          summary: '已拒绝',
        });
        continue;
      }
      const tool = toolMap.get(part.name);
      part.status = 'running';
      part.approvalId = undefined;
      send({ type: 'tool_result', id: part.id, name: part.name, status: 'ok', summary: '执行中…' });
      const call: LlmToolCall = {
        id: part.id,
        name: part.name,
        args: (part.args || {}) as Record<string, unknown>,
      };
      const started = Date.now();
      const result = await executeTool(call, tool);
      part.status = result.isError ? 'error' : 'ok';
      part.output = result.content;
      part.summary = result.summary || (result.isError ? '执行失败' : '已完成');
      part.durationMs = Date.now() - started;
      llmMessages.push({
        role: 'tool',
        toolCallId: part.id,
        name: part.name,
        content: result.content,
        isError: result.isError,
      });
      send({
        type: 'tool_result',
        id: part.id,
        name: part.name,
        status: part.status === 'ok' ? 'ok' : 'error',
        summary: part.summary,
        output: truncate(result.content, 4000),
        durationMs: part.durationMs,
      });
      if (tool?.dangerous) {
        await audit(
          { orgId: params.orgId, actorId: params.userId },
          'tool.invoke',
          { type: 'tool', id: part.name },
          { threadId: params.threadId, taskId: params.taskId, status: part.status },
        );
      }
      await applyResultExtras(result, parts, send, part.id);
    }
    await persist('streaming');
  } else {
    llmMessages = preHistory;
  }

  llmMessages = [{ role: 'system', content: systemPrompt }, ...llmMessages];
  const maxSteps = Math.min(
    Math.max(mode === 'plan' ? 1 : mode === 'ask' ? 6 : expert?.maxSteps || 8, 1),
    24,
  );
  const toolDefs = toolset.tools
    .filter((tool) => !(stockResearch && blockedStockTools.has(tool.name)))
    .map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));

  const fitMessages = (messages: LlmMessage[]): LlmMessage[] => {
    const maxChars = 32_000;
    const system = messages[0]?.role === 'system' ? messages[0] : null;
    const rest = system ? messages.slice(1) : messages;
    const lastUserIndex = [...rest].map((message) => message.role).lastIndexOf('user');
    if (lastUserIndex < 0) return messages;
    const sizeOf = (message: LlmMessage) =>
      typeof message.content === 'string' ? message.content.length : JSON.stringify(message.content).length;
    const tail = rest.slice(lastUserIndex).map((message) => {
      if (message.role !== 'tool') return message;
      const cap =
        message.name === 'run_skill_script'
          ? 7_000
          : message.name === 'skill_read_file'
            ? 3_000
            : message.name === 'web_search'
              ? 3_000
              : 2_500;
      return { ...message, content: truncate(message.content, cap) };
    });
    let used = (system ? sizeOf(system) : 0) + tail.reduce((sum, message) => sum + sizeOf(message), 0);
    const head = rest.slice(0, lastUserIndex);
    const keptHead: LlmMessage[] = [];
    for (let i = head.length - 1; i >= 0; i -= 1) {
      const message = head[i];
      const size = sizeOf(message);
      if (used + size > maxChars) break;
      keptHead.unshift(message);
      used += size;
    }
    return [...(system ? [system] : []), ...keptHead, ...tail];
  };
  const callMessages = () => {
    const fitted = fitMessages(llmMessages);
    if (!stockResearch) return fitted;
    return [
      ...fitted,
      {
        role: 'system' as const,
        content:
          '【当前请求锚点】以下是用户最新请求，必须以此为准，不得切换到其他公司或股票；如上下文被压缩，以本条为唯一标的：' +
          lastUserText(llmMessages) +
          (/港股|美股|HK|US|\.HK|纳斯达克|纽交所/i.test(lastUserText(llmMessages))
            ? '\n当前为港股/美股：live_market_scan 不提供结构化财务数据，禁止编造营收、净利、ROE、毛利率、现金流等具体数字，缺失一律写“未获取”。'
            : ''),
      },
    ];
  };

  let cancelled = false;
  let errorMessage = '';
  let lastFinishReason = '';

  try {
    const stableValue = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map((item) => stableValue(item)).join(',')}]`;
      if (value && typeof value === 'object') {
        const object = value as Record<string, unknown>;
        return `{${Object.keys(object).sort().map((key) => `${key}:${stableValue(object[key])}`).join(',')}}`;
      }
      return JSON.stringify(value ?? null);
    };
    const callSignature = (call: LlmToolCall) => `${call.name}:${stableValue(call.args || {})}`;
    let forceBreak = false;
    let consecutiveToolErrors = 0;
    let repeatedStepText = false;
    let liveScanSucceeded = parts.some(
      (part) =>
        part.type === 'tool' &&
        part.status === 'ok' &&
        part.name === 'run_skill_script' &&
        String((part.args as Record<string, unknown> | undefined)?.script || '') ===
          'scripts/live_market_scan.py',
    );
    const skillReadPaths = new Set(
      parts
        .filter(
          (part): part is ToolPart =>
            part.type === 'tool' &&
            part.status === 'ok' &&
            (part.name === 'skill_read_file' || part.name === 'read_skill_file'),
        )
        .map((part) => String((part.args as Record<string, unknown> | undefined)?.path || '')),
    );
    const seenStepTexts = new Set<string>();
    const lastRequest = lastUserText(llmMessages);
    const multiStockRequest = /(推荐|筛选|选股|几只|多只|多支|\d+\s*只|组合|对比|候选)/.test(lastRequest);

    while (steps < maxSteps) {
      if (params.signal?.aborted) {
        cancelled = true;
        break;
      }
      steps += 1;
      let textPart: TextPart | null = null;
      let reasoningPart: ReasoningPart | null = null;
      let stepText = '';

      const result = await streamChat({
        provider: resolved.provider,
        model: resolved.modelId,
        messages: callMessages(),
        tools: mode === 'plan' ? undefined : toolDefs,
        temperature: expert?.temperature ?? 0.4,
        signal: params.signal,
        onEvent: (event) => {
          if (event.type === 'text') {
            stepText += event.delta;
            if (!textPart) {
              textPart = { type: 'text', text: '' };
              parts.push(textPart);
            }
            textPart.text += event.delta;
            send({ type: 'text', delta: event.delta });
            schedulePersist();
          } else if (event.type === 'reasoning') {
            if (!reasoningPart) {
              reasoningPart = { type: 'reasoning', text: '' };
              parts.push(reasoningPart);
            }
            reasoningPart.text += event.delta;
            send({ type: 'reasoning', delta: event.delta });
            schedulePersist();
          } else if (event.type === 'tool_start') {
            if (!parts.some((p) => p.type === 'tool' && p.id === event.id)) {
              const part: ToolPart = {
                type: 'tool',
                id: event.id,
                name: event.name,
                title: toolTitle(event.name),
                status: 'running',
              };
              parts.push(part);
            }
            send({ type: 'tool_start', id: event.id, name: event.name });
          }
        },
      });
      runIn += result.usage.inputTokens;
      runOut += result.usage.outputTokens;
      lastFinishReason = result.finishReason;

      const normalizedStep = result.text.replace(/\s+/g, '').trim();
      if (normalizedStep.length > 60) {
        const repeated = [...seenStepTexts].some(
          (existing) =>
            existing === normalizedStep ||
            (existing.length > 100 && normalizedStep.includes(existing.slice(0, 100))),
        );
        if (repeated && !repeatedStepText) {
          repeatedStepText = true;
          loopGuard = true;
          forceBreak = true;
          llmMessages.push({
            role: 'user',
            content: '你已经重复了相同的说明。停止重复读取或抓取，直接基于已获取的数据完成分析并给出结论。',
          });
        }
        seenStepTexts.add(normalizedStep);
      }

      if (result.toolCalls.length) {
        llmMessages.push({
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
        });

        // 对齐参数与标题
        for (const call of result.toolCalls) {
          const tool = toolMap.get(call.name);
          let part = parts.find((p): p is ToolPart => p.type === 'tool' && p.id === call.id);
          if (!part) {
            part = {
              type: 'tool',
              id: call.id,
              name: call.name,
              title: tool?.title || toolTitle(call.name),
              status: 'running',
              args: call.args,
            };
            parts.push(part);
          }
          part.args = call.args;
          part.title = tool?.title || part.title || toolTitle(call.name);
        }

        const signatureOf = (value: unknown) => JSON.stringify(value || {});
        const findCached = (call: LlmToolCall) =>
          parts.find(
            (p): p is ToolPart =>
              p.type === 'tool' &&
              p.status === 'ok' &&
              p.name === call.name &&
              Boolean(p.output) &&
              p.id !== call.id &&
              signatureOf(p.args) === signatureOf(call.args),
          );

        const requiresApproval = result.toolCalls.filter((call) => {
          if (findCached(call)) return false;
          const tool = toolMap.get(call.name);
          return tool && needsApproval(tool, policy);
        });

        if (requiresApproval.length) {
          for (const call of result.toolCalls) {
            const part = parts.find((p): p is ToolPart => p.type === 'tool' && p.id === call.id);
            if (!part) continue;
            const tool = toolMap.get(call.name);
            const shouldAsk = requiresApproval.some((c) => c.id === call.id);
            if (!shouldAsk) {
              part.status = 'pending_approval';
              continue;
            }
            const approvalId = newId('apr');
            await db.insert(approvals).values({
              id: approvalId,
              orgId: params.orgId,
              threadId: params.threadId,
              messageId: assistant.id,
              taskId: params.taskId,
              runId,
              toolCallId: call.id,
              toolName: call.name,
              toolArgs: (call.args || {}) as Record<string, unknown>,
              risk: riskOf(tool || { name: call.name } as RuntimeTool),
              status: 'pending',
              expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
            });
            part.status = 'pending_approval';
            part.approvalId = approvalId;
            send({
              type: 'approval',
              approval: {
                id: approvalId,
                toolName: call.name,
                toolArgs: (call.args || {}) as Record<string, unknown>,
                risk: riskOf(tool || { name: call.name } as RuntimeTool),
                messageId: assistant.id,
                taskId: params.taskId || undefined,
              },
            });
            send({
              type: 'tool_result',
              id: call.id,
              name: call.name,
              status: 'pending_approval',
              summary: '等待人工审批',
              approvalId,
            });
          }
          await persist('awaiting_approval');
          const outcome = await finalize('awaiting_approval');
          return outcome;
        }

        for (const call of result.toolCalls) {
          const tool = toolMap.get(call.name);
          const part = parts.find(
            (p): p is ToolPart => p.type === 'tool' && p.id === call.id,
          ) || {
            type: 'tool' as const,
            id: call.id,
            name: call.name,
            status: 'running' as const,
            args: call.args,
          };
          if (!parts.includes(part)) parts.push(part);
          part.args = call.args;
          const isLiveScan =
            call.name === 'run_skill_script' &&
            String((call.args as Record<string, unknown> | undefined)?.script || '') ===
              'scripts/live_market_scan.py';
          const isSkillRead = call.name === 'skill_read_file' || call.name === 'read_skill_file';
          const reportAlreadyWritten =
            parts.some((item) => item.type === 'artifact') ||
            parts.some((item) => item.type === 'tool' && item.name === 'workspace_write' && item.status === 'ok');
          if (stockResearch && reportAlreadyWritten && (isSkillRead || isLiveScan)) {
            part.status = 'ok';
            part.summary = '报告已写入交付物，跳过重复取数';
            part.output = '完整报告已写入交付物，不再重复扫描或读取资料。';
            loopGuard = true;
            forceBreak = true;
            continue;
          }
          const skillReadPath = isSkillRead
            ? String((call.args as Record<string, unknown> | undefined)?.path || '')
            : '';
          if (
            stockResearch &&
            isSkillRead &&
            (skillReadPaths.has(skillReadPath) || skillReadPaths.size >= 3)
          ) {
            part.status = 'ok';
            part.summary = '已读取必要参考资料，跳过重复读取';
            part.output = '本轮已读取过该资料；请直接基于已有框架完成报告。';
            loopGuard = true;
            forceBreak = true;
            continue;
          }
          if (stockResearch && !multiStockRequest && liveScanSucceeded && isLiveScan) {
            part.status = 'ok';
            part.summary = '已获取该标的行情，跳过重复扫描';
            part.output = '单标的研究只需要扫描一次行情；请直接基于已有数据完成报告。';
            loopGuard = true;
            forceBreak = true;
            llmMessages.push({
              role: 'user',
              content: '当前是单标的研究，请不要重复调用 live_market_scan，直接完成报告。',
            });
            continue;
          }
          const signature = callSignature(call);
          const repeatCount = (toolCallCounts.get(signature) || 0) + 1;
          toolCallCounts.set(signature, repeatCount);
          if (repeatCount >= 2) {
            loopGuard = true;
            llmMessages.push({
              role: 'user',
              content: '该工具和相同参数刚刚已经执行过，结果已在上文。禁止重复读取或重复执行，直接基于已有结果继续完成任务。',
            });
          }
          if (repeatCount >= 3) {
            part.status = 'ok';
            part.summary = '重复调用已跳过';
            part.output = '相同工具与参数已执行过，系统已阻止重复调用。';
            forceBreak = true;
            break;
          }
          const cached = findCached(call);
          if (cached) {
            part.status = 'ok';
            part.output = cached.output;
            part.summary = cached.summary || '复用本轮已执行结果';
            part.durationMs = 0;
            llmMessages.push({
              role: 'tool',
              toolCallId: call.id,
              name: call.name,
              content: cached.output || '',
              isError: false,
            });
            send({
              type: 'tool_result',
              id: call.id,
              name: call.name,
              status: 'ok',
              summary: part.summary,
              output: truncate(cached.output || '', 4000),
              durationMs: 0,
            });
            continue;
          }
          part.status = 'running';
          const started = Date.now();
          send({ type: 'tool_result', id: call.id, name: call.name, status: 'ok', summary: '执行中…' });
          const toolResult = await executeTool(call, tool);
          if (!toolResult.isError && isLiveScan) liveScanSucceeded = true;
          if (!toolResult.isError && isSkillRead) skillReadPaths.add(skillReadPath);
          if (!toolResult.isError && call.name === 'workspace_write') forceBreak = true;
          if (toolResult.isError) {
            consecutiveToolErrors += 1;
            if (consecutiveToolErrors >= 2) {
              loopGuard = true;
              llmMessages.push({
                role: 'user',
                content:
                  '连续工具调用失败。停止继续抓取或更换数据源；请基于已经成功获取的数据完成分析，并明确标注缺失的数据和假设。',
              });
            }
            if (consecutiveToolErrors >= 3) forceBreak = true;
          } else {
            consecutiveToolErrors = 0;
          }
          part.status = toolResult.isError ? 'error' : 'ok';
          part.output = toolResult.content;
          part.summary = toolResult.summary || (toolResult.isError ? '执行失败' : '已完成');
          part.durationMs = Date.now() - started;
          llmMessages.push({
            role: 'tool',
            toolCallId: call.id,
            name: call.name,
            content: toolResult.content,
            isError: toolResult.isError,
          });
          send({
            type: 'tool_result',
            id: call.id,
            name: call.name,
            status: part.status === 'ok' ? 'ok' : 'error',
            summary: part.summary,
            output: truncate(toolResult.content, 4000),
            durationMs: part.durationMs,
          });
          if (tool?.dangerous) {
            await audit(
              { orgId: params.orgId, actorId: params.userId },
              'tool.invoke',
              { type: 'tool', id: call.name },
              {
                threadId: params.threadId,
                taskId: params.taskId,
                status: part.status,
                args: truncate(JSON.stringify(call.args || {}), 1000),
              },
            );
          }
          await applyResultExtras(toolResult, parts, send, call.id);
          schedulePersist(true);
        }
        if (forceBreak) break;
        continue;
      }

      if (result.text && !stepText) {
        const part: TextPart = { type: 'text', text: result.text };
        parts.push(part);
      }
      break;
    }
  } catch (err) {
    if (params.signal?.aborted) {
      cancelled = true;
    } else {
      errorMessage = (err as Error).message || '执行失败';
      send({ type: 'error', message: errorMessage });
      console.error('[cuter] Agent 运行失败', err);
    }
  }

  for (const part of parts) {
    if (part.type === 'tool' && (part.status === 'running' || part.status === 'pending_approval')) {
      part.status = 'error';
      part.summary = part.summary || '未执行完成';
    }
  }

  // 工具轮次用尽仍未产出正文时，强制一次“无工具收口”，避免只留下工具卡片或空回答。
  if (
    !cancelled &&
    !errorMessage &&
    steps >= maxSteps &&
    !textOfParts(parts).trim() &&
    parts.some((p) => p.type === 'tool')
  ) {
    try {
      let finalPart: TextPart | null = null;
      const synthesis = await streamChat({
        provider: resolved.provider,
        model: resolved.modelId,
        messages: [
          ...llmMessages,
          {
            role: 'user',
            content:
              '请基于以上工具返回结果，直接给出最终回答。不要再调用工具；如果信息不足，请明确说明缺口与下一步。',
          },
        ],
        temperature: expert?.temperature ?? 0.4,
        signal: params.signal,
        onEvent: (event) => {
          if (event.type === 'text') {
            if (!finalPart) {
              finalPart = { type: 'text', text: '' };
              parts.push(finalPart);
            }
            finalPart.text += event.delta;
            send({ type: 'text', delta: event.delta });
            schedulePersist();
          }
        },
      });
      runIn += synthesis.usage.inputTokens;
      runOut += synthesis.usage.outputTokens;
      lastFinishReason = synthesis.finishReason;
      if (synthesis.text && !finalPart) {
        parts.push({ type: 'text', text: synthesis.text });
      }
      await persist('streaming');
    } catch (err) {
      if (params.signal?.aborted) cancelled = true;
      else console.warn('[cuter] 最终收口失败', err);
    }
  }

  // 股票报告常见问题：模型读完资料后只输出“开始撰写”就结束，没有正文或交付物。
  // 这里做一次无工具收口，强制生成可读报告，避免界面看起来卡在过渡语。
  const currentText = textOfParts(parts).trim();
  const loadedStockSkill = toolset.skills.some((skill) => skill.name.includes('股票深度分析'));
  const wroteArtifact = parts.some(
    (part) => part.type === 'tool' && part.name === 'workspace_write' && part.status === 'ok',
  );
  const hasToolResult = parts.some((part) => part.type === 'tool' && part.status === 'ok');
  const looksLikeProgressOnly =
    currentText.length < 800 ||
    /(开始撰写|现在撰写|正在撰写|接下来|然后生成完整研究报告)[。.!！]?$/.test(currentText);
  if (
    !cancelled &&
    !errorMessage &&
    loadedStockSkill &&
    hasToolResult &&
    !wroteArtifact &&
    (looksLikeProgressOnly || (loopGuard && currentText.length < 1_200))
  ) {
    try {
      let reportPart: TextPart | null = null;
      if (textOfParts(parts).trim()) {
        const separator = '\n\n';
        parts.push({ type: 'text', text: separator });
        send({ type: 'text', delta: separator });
      }
      const synthesis = await streamChat({
        provider: resolved.provider,
        model: resolved.modelId,
        messages: [
          ...llmMessages,
          {
            role: 'user',
            content:
              '你已完成数据获取。现在不要调用工具，直接输出最终的中文深度研究报告，3000-4500 字。必须包含：结论卡片、行情快照与量价诊断、生意模式/行业格局、护城河/管理层、财务质量、估值（PE 锚定/反向 DCF/相对估值/敏感性）、下季度与 12 个月情景预测、催化剂/风险表、技术面执行参考、反方观点/数据缺口、来源与免责声明。不要只写“开始撰写”，不要复述工具参数。',
          },
        ],
        temperature: expert?.temperature ?? 0.4,
        maxTokens: 4096,
        signal: params.signal,
        onEvent: (event) => {
          if (event.type === 'text') {
            if (!reportPart) {
              reportPart = { type: 'text', text: '' };
              parts.push(reportPart);
            }
            reportPart.text += event.delta;
            send({ type: 'text', delta: event.delta });
            schedulePersist();
          }
        },
      });
      runIn += synthesis.usage.inputTokens;
      runOut += synthesis.usage.outputTokens;
      lastFinishReason = synthesis.finishReason;
      if (synthesis.text && !reportPart) {
        parts.push({ type: 'text', text: synthesis.text });
      }
      await persist('streaming');
    } catch (err) {
      if (params.signal?.aborted) cancelled = true;
      else console.warn('[cuter] 股票报告收口失败', err);
    }
  }

  dedupeTextParts(parts);
  // 只要股票工具已跑完、模型给出了正文但没有写文件，就自动落一个可预览的 Markdown 交付物。
  const finalStockText = textOfParts(parts).trim();
  if (
    !cancelled &&
    !errorMessage &&
    loadedStockSkill &&
    !wroteArtifact &&
    !parts.some((part) => part.type === 'artifact') &&
    finalStockText.length > 600
  ) {
    try {
      const normalized = finalStockText.replace(/(^|[^\n])(#{1,3}\s+)/g, '$1\n\n$2').trim();
      const headings = [...normalized.matchAll(/^#{1,3}[ \t]+(.+)$/gm)];
      const reportHeading =
        headings.find((match) => {
          const text = match[1].trim();
          return /(报告|分析|研究|预测|策略)/.test(text) && !/^(第[一二三四五六七八九十\d]+步|候选)/.test(text);
        }) || headings.find((match) => !/^(第[一二三四五六七八九十]+步|候选)/.test(match[1].trim()));
      const artifactText = reportHeading?.index
        ? normalized.slice(reportHeading.index).trim()
        : normalized;
      const heading = reportHeading?.[1]?.trim().replace(/^#+\s*/, '') || '股票分析报告';
      const safeName = heading.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
      const name = safeName + '_' + new Date().toISOString().slice(0, 10) + '.md';
      const artifact = await createArtifact({
        orgId: params.orgId,
        scopeId: params.threadId,
        name,
        relativePath: name,
        content: artifactText,
        mime: 'text/markdown',
        taskId: params.taskId,
        threadId: params.threadId,
        messageId: assistant.id,
      });
      parts.push({
        type: 'artifact',
        artifactId: artifact.id,
        name: artifact.name,
        mime: artifact.mime,
        size: artifact.size,
        kind: artifact.kind as 'document' | 'data' | 'code' | 'image' | 'other',
      });
      send({ type: 'artifact', artifact });
      await persist('streaming');
    } catch (err) {
      console.warn('[cuter] 自动保存股票报告失败', err);
    }
  }

  if (cancelled) return finalize('cancelled');
  if (errorMessage) return finalize('error', errorMessage);
  if (!textOfParts(parts).trim() && !parts.some((p) => p.type === 'artifact')) {
    const hasReasoning = parts.some((p) => p.type === 'reasoning' && p.text.trim());
    const hasTool = parts.some((p) => p.type === 'tool');
    const budget = lastFinishReason === 'length' ? '（输出长度受限）' : '';
    parts.push({
      type: 'text',
      text: hasReasoning
        ? `（模型只返回了思考过程${budget}，未生成最终回答。请增大本地模型上下文/输出预算，或关闭深度思考后重试。）`
        : hasTool
          ? `（工具已执行，但模型没有生成最终说明${budget}。可以继续追问，或检查上方工具返回结果。）`
          : `（模型未返回内容${budget}，请重试或检查模型配置。）`,
    });
  }
  void finished;
  return finalize('completed');
}

async function applyResultExtras(
  result: ToolResult,
  parts: MessagePart[],
  send: (event: RuntimeEvent) => void,
  callId: string,
): Promise<void> {
  if (result.citations?.length) {
    const startIndex = parts.filter((p) => p.type === 'citation').length;
    for (const [i, citation] of result.citations.entries()) {
      const item = { ...citation, index: startIndex + i + 1 };
      parts.push(item);
      send({ type: 'citation', citation: item });
    }
  }
  if (result.artifacts?.length) {
    for (const artifact of result.artifacts) {
      const part: MessagePart = {
        type: 'artifact',
        artifactId: artifact.id,
        name: artifact.name,
        mime: artifact.mime,
        size: artifact.size,
        kind: artifact.kind as 'document' | 'data' | 'code' | 'image' | 'other',
      };
      parts.push(part);
      send({ type: 'artifact', artifact });
    }
  }
  void callId;
}

async function delegateToExpert(
  params: RunParams,
  expertId: string,
  goal: string,
): Promise<string> {
  const db = await getDb();
  const expert = await loadExpert(params.orgId, expertId);
  if (!expert) return '目标专家不存在';
  const resolved = await resolveModel(params.orgId, expert.providerId, expert.modelId);
  const kbIds = await kbIdsOf(params.orgId, expert);
  const toolset = await buildToolset({
    orgId: params.orgId,
    expert,
    mode: 'ask',
    kbIds,
    depth: (params.depth || 0) + 1,
    query: goal,
  });
  const system = buildSystemPrompt({
    orgName: '组织',
    expert,
    mode: 'ask',
    skillInstructions: toolset.instructions,
    knowledge: '',
    depth: (params.depth || 0) + 1,
  });
  const messages: LlmMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: `子任务：${goal}\n\n请直接给出可供主专家使用的高质量结论。` },
  ];
  const toolMap = new Map(toolset.tools.map((t) => [t.name, t]));
  let text = '';
  for (let step = 0; step < 3; step++) {
    const result = await streamChat({
      provider: resolved.provider,
      model: resolved.modelId,
      messages,
      tools: toolset.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
      temperature: 0.3,
      signal: params.signal,
    });
    text += result.text;
    if (!result.toolCalls.length) break;
    messages.push({ role: 'assistant', content: result.text, toolCalls: result.toolCalls });
    for (const call of result.toolCalls) {
      const tool = toolMap.get(call.name);
      let content = '工具不可用';
      if (tool) {
        const validated = validateArgs(tool.parameters, call.args);
        if (validated.ok) {
          try {
            const res = await tool.execute(validated.value, {
              orgId: params.orgId,
              userId: params.userId,
              expertId: expert.id,
              threadId: params.threadId,
              taskId: params.taskId,
              messageId: params.messageId,
              scopeId: params.threadId,
              mode: 'ask',
              signal: params.signal,
              emit: () => undefined,
              kbIds,
            });
            content = res.content;
          } catch (err) {
            content = `执行失败：${(err as Error).message}`;
          }
        }
      }
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content });
    }
  }
  return text || '子专家未返回结论';
}
