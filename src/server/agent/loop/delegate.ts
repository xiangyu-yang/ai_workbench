import { resolveModel, streamChat } from '@/server/llm/gateway';
import type { LlmMessage } from '@/server/llm/types';
import { buildSystemPrompt } from '../prompt';
import { buildToolset } from '../tools';
import { validateArgs } from '../validate';
import { kbIdsOf, loadExpert } from './experts';
import type { RunParams } from '../runtime';

/**
 * 一次专家委派：加载目标专家自己的模型、技能、知识库与只读工具，
 * 在独立上下文中执行最多 3 步，只把结论摘要回注主 Agent。
 */
export async function delegateToExpert(
  params: RunParams,
  expertId: string,
  goal: string,
): Promise<string> {
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
  const toolMap = new Map(toolset.tools.map((tool) => [tool.name, tool]));
  let text = '';
  for (let step = 0; step < 3; step++) {
    const result = await streamChat({
      provider: resolved.provider,
      model: resolved.modelId,
      messages,
      tools: toolset.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
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
