import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import {
  approvals,
  artifacts,
  experts,
  messages,
  taskEvents,
  taskSteps,
  tasks,
} from '@/server/db/schema';
import { TaskDetail } from '@/components/tasks/task-detail';
import type { ChatPart } from '@/lib/chat-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select({ title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.orgId, auth.org.id), eq(tasks.id, id)))
    .limit(1);
  return { title: rows[0]?.title || '任务' };
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select({ task: tasks, expert: experts })
    .from(tasks)
    .leftJoin(experts, eq(experts.id, tasks.expertId))
    .where(and(eq(tasks.orgId, auth.org.id), eq(tasks.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) notFound();

  const [steps, events, artifactRows, approvalRows] = await Promise.all([
    db.select().from(taskSteps).where(eq(taskSteps.taskId, id)).orderBy(asc(taskSteps.ordinal)),
    db.select().from(taskEvents).where(eq(taskEvents.taskId, id)).orderBy(asc(taskEvents.seq)),
    db.select().from(artifacts).where(eq(artifacts.taskId, id)),
    db.select().from(approvals).where(eq(approvals.taskId, id)).orderBy(asc(approvals.createdAt)),
  ]);

  let messageRows: Array<typeof messages.$inferSelect> = [];
  if (row.task.threadId) {
    messageRows = await db
      .select()
      .from(messages)
      .where(eq(messages.threadId, row.task.threadId))
      .orderBy(asc(messages.createdAt))
      .limit(40);
  }

  return (
    <TaskDetail
      initial={{
        task: {
          id: row.task.id,
          title: row.task.title,
          goal: row.task.goal,
          status: row.task.status,
          progress: row.task.progress,
          expertId: row.task.expertId,
          error: row.task.error,
          resultSummary: row.task.resultSummary,
          runCount: row.task.runCount,
          schedule: row.task.schedule,
          nextRunAt: row.task.nextRunAt?.toISOString() || null,
          lastRunAt: row.task.lastRunAt?.toISOString() || null,
          createdAt: row.task.createdAt.toISOString(),
          startedAt: row.task.startedAt?.toISOString() || null,
          finishedAt: row.task.finishedAt?.toISOString() || null,
        },
        expert: row.expert
          ? {
              id: row.expert.id,
              name: row.expert.name,
              icon: row.expert.icon,
              accent: row.expert.accent,
            }
          : null,
        steps: steps.map((step) => ({
          id: step.id,
          ordinal: step.ordinal,
          title: step.title,
          detail: step.detail,
          status: step.status,
        })),
        events: events.map((event) => ({
          id: event.id,
          seq: event.seq,
          type: event.type,
          payload: event.payload,
          createdAt: event.createdAt.toISOString(),
        })),
        artifacts: artifactRows.map((artifact) => ({
          id: artifact.id,
          name: artifact.name,
          mime: artifact.mime,
          size: artifact.size,
          kind: artifact.kind as 'document' | 'data' | 'code' | 'image' | 'other',
          taskId: artifact.taskId,
        })),
        approvals: approvalRows.map((approval) => ({
          id: approval.id,
          toolName: approval.toolName,
          toolArgs: approval.toolArgs,
          risk: approval.risk,
          status: approval.status,
          messageId: approval.messageId,
          taskId: approval.taskId,
        })),
        messages: messageRows.map((message) => ({
          id: message.id,
          role: message.role,
          parts: (message.parts || []) as ChatPart[],
          content: message.content,
          status: message.status,
          createdAt: message.createdAt.toISOString(),
        })),
      }}
    />
  );
}
