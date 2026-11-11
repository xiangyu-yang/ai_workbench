import type { LlmMessage, LlmResult, LlmToolCall, StreamChatParams } from './types';

/**
 * 内置演示模型：零 API Key 也能完整体验流式、工具调用、计划与交付物链路。
 * 生产环境配置真实供应商后不再使用。
 */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function textOf(message: LlmMessage): string {
  if (message.role === 'user') {
    return typeof message.content === 'string'
      ? message.content
      : message.content.map((p) => (p.type === 'text' ? p.text : '[图片]')).join('\n');
  }
  return '';
}

function titleFrom(prompt: string): string {
  const clean = prompt.replace(/[#*`>]/g, '').replace(/^[\s\S]{0, 6}?(帮我|请|麻烦|给我)/, '').trim();
  return (clean.split(/[\n。；;]/)[0] || '工作成果').slice(0, 40);
}

function documentBody(prompt: string, title: string): string {
  const date = new Date().toLocaleDateString('zh-CN');
  const points = prompt
    .split(/[\n。；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4)
    .slice(0, 5);
  const bullets =
    points.length > 0
      ? points.map((p, i) => `${i + 1}. **${p.slice(0, 42)}** —— 建议明确负责人、验收标准与时间节点。`).join('\n')
      : '1. **明确目标** —— 将目标拆解为可验收的产出。\n2. **识别约束** —— 资源、时间与合规边界。\n3. **制定节奏** —— 以周为单位设置检查点。';

  return `# ${title}

> 由 Cuter 工作台生成 · ${date}

## 一、背景与目标

${prompt.slice(0, 600)}

本方案聚焦"可执行、可验收、可复用"三个原则，将目标拆解为清晰的行动路径。

## 二、关键结论

${bullets}

## 三、执行计划

| 阶段 | 关键动作 | 交付物 | 建议周期 |
| --- | --- | --- | --- |
| 对齐 | 明确范围、角色与验收标准 | 目标对齐纪要 | 1 周 |
| 攻坚 | 按优先级推进核心事项 | 阶段成果包 | 2–3 周 |
| 收口 | 复盘数据、沉淀方法与资产 | 复盘报告 + 资产清单 | 1 周 |

## 四、风险与应对

- **范围蔓延**：冻结本期范围，新增需求进入下一迭代。
- **协同成本**：明确单一责任人（DRI），减少多头决策。
- **质量波动**：设置自动化校验与人工抽检双保险。

## 五、下一步

1. 确认本方案的优先级与资源投入。
2. 指定每个阶段的责任人与验收人。
3. 在 Cuter 中创建任务，按阶段跟踪交付物。

---
*本文档为演示模型生成的示例交付物，配置真实模型后可获得针对业务上下文的深度内容。*
`;
}

export async function mockStream(params: StreamChatParams): Promise<LlmResult> {
  const started = Date.now();
  const { messages, tools, onEvent, signal } = params;
  const toolNames = new Set((tools || []).map((t) => t.name));
  const last = messages[messages.length - 1];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = lastUser ? textOf(lastUser) : '';
  const toolMessages = messages.filter((m) => m.role === 'tool');
  const lastTool = toolMessages[toolMessages.length - 1];
  const usedTools = new Set(
    toolMessages.map((m) => (m.role === 'tool' ? m.name : '')).filter(Boolean),
  );

  const emitText = async (value: string) => {
    if (signal?.aborted) throw new Error('已取消');
    const chunks = value.match(/[\s\S]{1,6}/g) || [];
    for (const chunk of chunks) {
      if (signal?.aborted) throw new Error('已取消');
      onEvent?.({ type: 'text', delta: chunk });
      await sleep(12);
    }
  };
  const emitReasoning = async (value: string) => {
    if (!value) return;
    for (const chunk of value.match(/[\s\S]{1,8}/g) || []) {
      if (signal?.aborted) throw new Error('已取消');
      onEvent?.({ type: 'reasoning', delta: chunk });
      await sleep(10);
    }
  };

  const call = (name: string, args: Record<string, unknown>): LlmResult => {
    const id = `mock_${Math.random().toString(36).slice(2, 10)}`;
    onEvent?.({ type: 'tool_start', id, name });
    return {
      text: '',
      reasoning: '',
      toolCalls: [{ id, name, args }],
      usage: { inputTokens: Math.ceil(prompt.length / 2), outputTokens: 40 },
      finishReason: 'tool_calls',
      latencyMs: Date.now() - started,
    };
  };

  // 1) 首轮：任务模式先产出计划
  if (toolNames.has('update_plan') && !usedTools.has('update_plan') && last?.role === 'user') {
    await emitReasoning('先拆解目标，形成可追踪的执行计划，再逐步交付。');
    await sleep(200);
    return call('update_plan', {
      steps: [
        { title: '明确目标与验收标准', detail: '梳理输入材料，确认范围与交付格式' },
        { title: '检索与整理关键信息', detail: '从知识库/资料中提取可用的事实与数据' },
        { title: '产出交付物初稿', detail: '形成结构化文档并保存到工作区' },
        { title: '自检与完善', detail: '检查一致性、引用与格式，输出最终版本' },
      ],
    });
  }

  // 2) 需要查询 MCP 工单系统
  const ticketTool = [...toolNames].find((name) => name.includes('search_tickets'));
  if (ticketTool && !usedTools.has(ticketTool) && /工单|ticket/i.test(prompt)) {
    await emitReasoning('通过 MCP 连接器查询工单系统，获取实时数据。');
    await sleep(150);
    return call(ticketTool, { status: 'open', limit: 5 });
  }

  // 3) 需要检索知识库
  if (
    toolNames.has('knowledge_search') &&
    !usedTools.has('knowledge_search') &&
    /知识库|资料库|根据.*(文档|资料|材料)|检索|查一下|内部制度/.test(prompt)
  ) {
    await emitReasoning('这个问题需要先检索组织资料，确保回答基于可信来源。');
    await sleep(150);
    return call('knowledge_search', { query: prompt.slice(0, 120) || '相关制度与资料' });
  }

  // 3) 需要生成交付物
  if (
    toolNames.has('workspace_write') &&
    !usedTools.has('workspace_write') &&
    /文档|报告|方案|周报|纪要|计划书|标书|总结|PPT|表格|梳理成/.test(prompt)
  ) {
    const title = titleFrom(prompt);
    const filename = `${title.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 24) || '交付物'}.md`;
    await emitReasoning('将结论整理为结构化文档，并写入工作区作为可下载交付物。');
    await sleep(200);
    return call('workspace_write', {
      path: filename,
      content: documentBody(prompt, title),
    });
  }

  // 4) MCP 工单查询结果 → 结构化回答
  if (lastTool && lastTool.role === 'tool' && lastTool.name.includes('search_tickets')) {
    let tickets: Array<{ id?: string; title?: string; status?: string; priority?: string }> = [];
    try {
      const parsed = JSON.parse(lastTool.content) as {
        tickets?: Array<{ id?: string; title?: string; status?: string; priority?: string }>;
      };
      tickets = parsed.tickets || [];
    } catch {
      /* ignore */
    }
    if (tickets.length) {
      const rows = tickets
        .map(
          (ticket) =>
            `| ${ticket.id || '—'} | ${ticket.title || '—'} | ${ticket.priority || '—'} | ${ticket.status || '—'} |`,
        )
        .join('\n');
      const answer = `已通过连接器查询到 **${tickets.length}** 条未关闭工单：\n\n| 工单号 | 标题 | 优先级 | 状态 |\n| --- | --- | --- | --- |\n${rows}\n\n### 建议处理顺序\n\n1. 先处理 **P1** 工单，确认影响范围与临时绕行方案。\n2. 将需要产品介入的问题同步到需求池，并标注客户影响。\n3. 对 P2/P3 工单设置 SLA 提醒，避免沉默超时。\n\n> 数据来自 MCP 连接器实时查询，已记录审计事件。`;
      await emitText(answer);
      return {
        text: answer,
        reasoning: '',
        toolCalls: [],
        usage: { inputTokens: 300, outputTokens: 260 },
        finishReason: 'stop',
        latencyMs: Date.now() - started,
      };
    }
  }

  // 5) 知识库检索结果 → 基于片段回答
  if (lastTool && lastTool.role === 'tool' && lastTool.name === 'knowledge_search') {
    let results: Array<{ title?: string; snippet?: string; source?: string }> = [];
    try {
      const parsed = JSON.parse(lastTool.content) as {
        results?: Array<{ title?: string; snippet?: string; source?: string }>;
      };
      results = parsed.results || [];
    } catch {
      /* ignore */
    }
    if (results.length) {
      const lines = results.slice(0, 4).map((r, i) => {
        const snippet = (r.snippet || '').replace(/\s+/g, ' ').slice(0, 180);
        return `${i + 1}. **${r.title || '相关资料'}**：${snippet}…`;
      });
      await emitText(
        `我检索了组织知识库，找到 ${results.length} 条相关片段：\n\n${lines.join('\n\n')}\n\n**综合判断**：以上内容来自内部资料，建议以最新版本为准；如需我进一步对比多份材料，可以直接指定文档名称。\n\n> 演示模型仅做摘要展示，配置真实模型后可进行深度推理与引用。`,
      );
    } else {
      await emitText(
        '知识库中没有检索到直接相关的内容。建议：\n\n1. 换用更具体的关键词（如制度名称、业务对象）；\n2. 在「知识库」中上传对应文档后重新提问；\n3. 或让我基于公开常识给出初步框架。',
      );
    }
    return {
      text: '',
      reasoning: '',
      toolCalls: [],
      usage: { inputTokens: 200, outputTokens: 200 },
      finishReason: 'stop',
      latencyMs: Date.now() - started,
    };
  }

  // 5) 交付物已写入 → 任务模式提交完成，否则直接收口
  if (lastTool && lastTool.role === 'tool' && lastTool.name === 'workspace_write') {
    if (toolNames.has('complete_task') && !usedTools.has('complete_task')) {
      return call('complete_task', {
        summary: '已生成结构化交付文档并保存到工作区，可在交付物面板查看。',
      });
    }
    const closing = `已生成交付物，可在右侧「交付物」面板预览或下载。\n\n### 交付说明\n\n- **内容结构**：背景目标 → 关键结论 → 执行计划 → 风险应对 → 下一步\n- **使用建议**：替换其中的示例数据与责任人，即可作为正式材料的基础版本\n- **后续动作**：可以把这份文档转为任务，设置每周自动更新\n\n需要我调整篇幅、语气，或补充数据支撑吗？`;
    await emitText(closing);
    return {
      text: closing,
      reasoning: '',
      toolCalls: [],
      usage: { inputTokens: 400, outputTokens: 260 },
      finishReason: 'stop',
      latencyMs: Date.now() - started,
    };
  }

  if (lastTool && lastTool.role === 'tool' && lastTool.name === 'complete_task') {
    const closing = `任务已完成，交付物已保存到工作区。\n\n### 交付说明\n\n- **计划**：目标对齐 → 信息整理 → 初稿产出 → 自检完善\n- **产物**：可在右侧「交付物」面板预览、下载或继续加工\n- **复用**：把该任务设为定时执行，可持续产出同类材料\n\n需要我调整结构、补充数据，或改为表格形式吗？`;
    await emitText(closing);
    return {
      text: closing,
      reasoning: '',
      toolCalls: [],
      usage: { inputTokens: 420, outputTokens: 240 },
      finishReason: 'stop',
      latencyMs: Date.now() - started,
    };
  }

  // 6) 系统上下文已自动召回知识库 → 基于片段作答
  const systemMessage = messages.find((message) => message.role === 'system');
  const knowledgeBlock =
    systemMessage && typeof systemMessage.content === 'string'
      ? systemMessage.content.match(
          /<untrusted_data type="knowledge_base">([\s\S]*?)<\/untrusted_data>/,
        )?.[1]
      : null;
  if (knowledgeBlock && !lastTool) {
    const entries: Array<{ index: string; title: string; snippet: string }> = [];
    const pattern = /\[(\d+)\] 来源：([^\n（]+)[^\n]*\n([\s\S]*?)(?=\n\n---|$)/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(knowledgeBlock)) && entries.length < 3) {
      entries.push({
        index: match[1],
        title: match[2].trim(),
        snippet: match[3].replace(/\s+/g, ' ').trim().slice(0, 200),
      });
    }
    if (entries.length) {
      const body = entries
        .map(
          (entry) =>
            `**${entry.title}** [${entry.index}]：${entry.snippet}${entry.snippet.length >= 200 ? '…' : ''}`,
        )
        .join('\n\n');
      const answer = `我检索了组织知识库，与你的问题最相关的原文如下：\n\n${body}\n\n**说明**：以上内容直接摘自内部资料，引用序号对应下方「参考来源」。涉及金额、时效等硬性规定时，请以制度最新版本为准；如需我进一步对比或整理成表格，直接告诉我即可。\n\n> 当前为演示模型，仅展示检索与引用链路；配置真实模型后可进行归纳、推理与多文档对比。`;
      await emitText(answer);
      return {
        text: answer,
        reasoning: '',
        toolCalls: [],
        usage: {
          inputTokens: Math.ceil(prompt.length / 2) + 400,
          outputTokens: Math.ceil(answer.length / 2),
        },
        finishReason: 'stop',
        latencyMs: Date.now() - started,
      };
    }
  }

  // 7) 默认回答
  const isGreeting = /^(你好|hi|hello|嗨|在吗)[!！。\s]*$/i.test(prompt.trim());
  const answer = isGreeting
    ? `你好，我是 **Cuter 工作台** 的演示模型。\n\n你可以直接给我一个目标，例如：\n\n- 「帮我写一份 Q4 增长复盘报告」\n- 「把这份会议纪要整理成行动项」\n- 「基于知识库回答：差旅报销标准是什么？」\n\n当前未配置真实模型，我用内置演示能力展示**流式输出、任务规划、知识检索与交付物**的完整链路。管理员在「设置 → 模型供应商」填入 API Key 后即可切换为真实模型。`
    : `收到。你提出的目标是：\n\n> ${prompt.slice(0, 280).replace(/\n/g, ' ')}\n\n### 我的理解\n\n这是一个需要"先对齐、再拆解、后交付"的任务。演示模型不会调用真实大模型，但会完整走通平台的执行链路：\n\n1. 生成可追踪的计划步骤\n2. 在需要时检索组织知识库\n3. 将结果写入工作区，形成可预览、可下载的交付物\n4. 全程记录用量与审计事件\n\n### 建议下一步\n\n- 直接说「**生成一份文档**」，我会产出 Markdown 交付物；\n- 或说「**创建任务**」，我会在任务中心异步执行并跟踪进度；\n- 管理员配置真实模型后，可获得完整的推理与工具能力。\n\n> 提示：使用「执行」模式时，我可以自动调用工具；「规划」模式只输出计划，等你确认。`;

  await emitText(answer);
  return {
    text: answer,
    reasoning: '',
    toolCalls: [],
    usage: { inputTokens: Math.ceil(prompt.length / 2) + 80, outputTokens: Math.ceil(answer.length / 2) },
    finishReason: 'stop',
    latencyMs: Date.now() - started,
  };
}

export const MOCK_MODEL = {
  id: 'cuter-demo',
  name: 'Cuter 演示模型',
  contextWindow: 32_000,
  maxOutput: 4096,
  vision: false,
  inputPrice: 0,
  outputPrice: 0,
};
