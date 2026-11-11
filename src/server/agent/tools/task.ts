import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { taskSteps, tasks } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { appendTaskEvent, refreshTaskProgress } from '@/server/tasks/events';
import type { RuntimeTool } from './types';

export const updatePlanTool: RuntimeTool = {
  name: 'update_plan',
  title: '更新执行计划',
  description:
    '为当前任务创建执行计划（3-7 个步骤）。必须在开始实际工作前调用一次；后续如需调整可再次调用。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        description: '步骤列表',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: '步骤标题' },
            detail: { type: 'string', description: '验收要点或说明' },
          },
          required: ['title'],
        },
      },
    },
    required: ['steps'],
  },
  async execute(args, ctx) {
    if (!ctx.taskId) return { content: '当前不在任务上下文中', isError: true };
    const raw = Array.isArray(args.steps) ? args.steps : [];
    const steps = raw
      .slice(0, 10)
      .map((s) => {
        const item = (s || {}) as Record<string, unknown>;
        return { title: String(item.title || '').slice(0, 120), detail: String(item.detail || '') };
      })
      .filter((s) => s.title);
    if (!steps.length) return { content: '计划至少需要一个步骤', isError: true };

    const db = await getDb();
    await db.delete(taskSteps).where(eq(taskSteps.taskId, ctx.taskId));
    await db.insert(taskSteps).values(
      steps.map((step, index) => ({
        id: newId('stp'),
        orgId: ctx.orgId,
        taskId: ctx.taskId as string,
        ordinal: index,
        title: step.title,
        detail: step.detail,
        status: index === 0 ? 'running' : 'pending',
      })),
    );
    await refreshTaskProgress(ctx.orgId, ctx.taskId);
    await appendTaskEvent(ctx.orgId, ctx.taskId, 'task.plan', { steps });
    return {
      content: `计划已创建，共 ${steps.length} 步。请按顺序执行，并在完成每一步后调用 update_step。`,
      summary: `${steps.length} 个步骤`,
    };
  },
};

export const updateStepTool: RuntimeTool = {
  name: 'update_step',
  title: '更新步骤状态',
  description: '标记任务步骤的进度：running / done / failed，并可补充说明。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      index: { type: 'integer', description: '步骤序号，从 1 开始' },
      status: { type: 'string', enum: ['running', 'done', 'failed'], description: '新状态' },
      detail: { type: 'string', description: '补充说明（可选）' },
    },
    required: ['index', 'status'],
  },
  async execute(args, ctx) {
    if (!ctx.taskId) return { content: '当前不在任务上下文中', isError: true };
    const index = Math.max(1, Number(args.index) || 1) - 1;
    const status = String(args.status || '');
    if (!['running', 'done', 'failed'].includes(status)) {
      return { content: '状态必须是 running / done / failed', isError: true };
    }
    const db = await getDb();
    const rows = await db
      .select()
      .from(taskSteps)
      .where(and(eq(taskSteps.taskId, ctx.taskId), eq(taskSteps.orgId, ctx.orgId)));
    const target = rows.find((r) => r.ordinal === index);
    if (!target) return { content: `未找到第 ${index + 1} 步`, isError: true };
    await db
      .update(taskSteps)
      .set({
        status,
        detail: args.detail ? String(args.detail).slice(0, 500) : target.detail,
        updatedAt: new Date(),
      })
      .where(eq(taskSteps.id, target.id));

    if (status === 'done') {
      const next = rows.find((r) => r.ordinal === index + 1);
      if (next) {
        await db
          .update(taskSteps)
          .set({ status: 'running', updatedAt: new Date() })
          .where(eq(taskSteps.id, next.id));
      }
    }
    const progress = await refreshTaskProgress(ctx.orgId, ctx.taskId);
    await appendTaskEvent(ctx.orgId, ctx.taskId, 'task.step', {
      index: index + 1,
      title: target.title,
      status,
      progress,
    });
    return { content: `第 ${index + 1} 步已标记为 ${status}，总进度 ${progress}%`, summary: `${progress}%` };
  },
};

export const completeTaskTool: RuntimeTool = {
  name: 'complete_task',
  title: '完成任务',
  description: '任务的全部交付物已生成后调用，提交最终成果摘要并结束任务。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: '最终成果摘要（给用户看，2-5 句）' },
    },
    required: ['summary'],
  },
  async execute(args, ctx) {
    if (!ctx.taskId) return { content: '当前不在任务上下文中', isError: true };
    const summary = String(args.summary || '').slice(0, 2000);
    const db = await getDb();
    await db
      .update(tasks)
      .set({
        status: 'completed',
        resultSummary: summary,
        progress: 100,
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(tasks.id, ctx.taskId), eq(tasks.orgId, ctx.orgId)));
    await db
      .update(taskSteps)
      .set({ status: 'done', updatedAt: new Date() })
      .where(and(eq(taskSteps.taskId, ctx.taskId), eq(taskSteps.orgId, ctx.orgId)));
    await appendTaskEvent(ctx.orgId, ctx.taskId, 'task.completed', { summary });
    return { content: '任务已完成并记录成果摘要。', summary: '已完成' };
  },
};

export const createTaskTool: RuntimeTool = {
  name: 'create_task',
  title: '创建任务',
  description:
    '把复杂目标转为后台异步任务，由当前专家自主执行并交付成果。适合耗时较长、需要多步骤的工作。',
  readonly: true,
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: '任务标题，简短明确' },
      goal: { type: 'string', description: '完整目标与验收要求' },
    },
    required: ['title', 'goal'],
  },
  async execute(args, ctx) {
    const title = String(args.title || '').trim().slice(0, 120);
    const goal = String(args.goal || '').trim();
    if (!title || !goal) return { content: '标题与目标不能为空', isError: true };
    const db = await getDb();
    const id = newId('tsk');
    await db.insert(tasks).values({
      id,
      orgId: ctx.orgId,
      title,
      goal,
      expertId: ctx.expertId || null,
      mode: 'agent',
      status: 'queued',
      createdBy: ctx.userId,
    });
    await appendTaskEvent(ctx.orgId, id, 'task.created', { title, goal, from: 'chat' });
    const { enqueueTask } = await import('@/server/tasks/runner');
    enqueueTask(id);
    return {
      content: `已创建任务「${title}」，任务 ID：${id}。用户可在任务中心查看实时进度与交付物。`,
      summary: `已创建任务 ${title}`,
    };
  },
};
