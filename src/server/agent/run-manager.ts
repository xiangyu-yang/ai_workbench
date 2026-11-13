import { runAgent, type RunParams, type RunOutcome } from './runtime';

type ActiveRun = {
  controller: AbortController;
  promise: Promise<RunOutcome>;
};

type RunStore = {
  runs: Map<string, ActiveRun>;
};

const globalStore = globalThis as unknown as { __cuter_agent_runs?: RunStore };
const store: RunStore = (globalStore.__cuter_agent_runs ||= { runs: new Map() });

/**
 * 对话生成与 HTTP 请求解耦：客户端离开页面时不再中断模型调用，
 * 只有显式 stop / 超时 / 服务停止才会 abort。消息内容由 Runtime 定期落库，
 * 前端返回会话后通过消息轮询追平。
 */
export function startAgentRun(params: Omit<RunParams, 'signal'>): ActiveRun {
  const existing = store.runs.get(params.messageId);
  if (existing) return existing;

  const controller = new AbortController();
  const promise = runAgent({ ...params, signal: controller.signal })
    .catch((err) => {
      console.error('[cuter] agent run failed', params.messageId, err);
      return {
        status: 'error' as const,
        content: '',
        inputTokens: 0,
        outputTokens: 0,
        error: err instanceof Error ? err.message : '执行失败',
      };
    })
    .finally(() => {
      if (store.runs.get(params.messageId)?.controller === controller) {
        store.runs.delete(params.messageId);
      }
    });

  const entry = { controller, promise };
  store.runs.set(params.messageId, entry);
  return entry;
}

export function stopAgentRun(messageId: string): boolean {
  const entry = store.runs.get(messageId);
  if (!entry) return false;
  entry.controller.abort();
  return true;
}

export function isAgentRunActive(messageId: string): boolean {
  return store.runs.has(messageId);
}
