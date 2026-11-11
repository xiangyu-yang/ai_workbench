import { and, asc, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import {
  apps,
  approvals,
  artifacts,
  experts,
  messages,
  modelProviders,
  threads,
} from '@/server/db/schema';
import { ChatView } from '@/components/chat/chat-view';
import type { ChatMessage, ChatPart } from '@/lib/chat-types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const db = await getDb();
  const rows = await db
    .select({ title: threads.title })
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.orgId, auth.org.id)))
    .limit(1);
  return { title: rows[0]?.title || '对话' };
}

export default async function ChatThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ app?: string }>;
}) {
  const auth = await requirePageAuth();
  const { id } = await params;
  const { app: appQuery } = await searchParams;
  const db = await getDb();

  const threadRows = await db
    .select()
    .from(threads)
    .where(and(eq(threads.orgId, auth.org.id), eq(threads.id, id)))
    .limit(1);
  const thread = threadRows[0];
  if (!thread || thread.userId !== auth.user.id || thread.source !== 'chat') notFound();

  const [messageRows, artifactRows, approvalRows, expertRows, providerRows, appRows] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(and(eq(messages.orgId, auth.org.id), eq(messages.threadId, id)))
      .orderBy(asc(messages.createdAt))
      .limit(120),
    db
      .select({
        id: artifacts.id,
        name: artifacts.name,
        mime: artifacts.mime,
        size: artifacts.size,
        kind: artifacts.kind,
        taskId: artifacts.taskId,
      })
      .from(artifacts)
      .where(and(eq(artifacts.orgId, auth.org.id), eq(artifacts.threadId, id))),
    db
      .select()
      .from(approvals)
      .where(
        and(
          eq(approvals.orgId, auth.org.id),
          eq(approvals.threadId, id),
          eq(approvals.status, 'pending'),
        ),
      ),
    db
      .select()
      .from(experts)
      .where(eq(experts.orgId, auth.org.id))
      .orderBy(asc(experts.createdAt)),
    db
      .select({ defaultModel: modelProviders.defaultModel })
      .from(modelProviders)
      .where(and(eq(modelProviders.orgId, auth.org.id), eq(modelProviders.enabled, true)))
      .limit(1),
    appQuery
      ? db
          .select()
          .from(apps)
          .where(and(eq(apps.orgId, auth.org.id), eq(apps.id, appQuery)))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const launchedApp = appRows[0] || null;

  const expert = expertRows.find((item) => item.id === thread.expertId);
  const chatMessages: ChatMessage[] = messageRows
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      id: message.id,
      role: message.role as 'user' | 'assistant',
      parts: (message.parts || []) as ChatPart[],
      content: message.content,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
      model: message.model || undefined,
    }));

  return (
    <ChatView
      key={`${thread.id}:${launchedApp?.id || 'none'}`}
      threadId={thread.id}
      initialTitle={thread.title}
      initialMessages={chatMessages}
      initialArtifacts={artifactRows.map((artifact) => ({
        ...artifact,
        kind: artifact.kind as 'document' | 'data' | 'code' | 'image' | 'other',
      }))}
      initialApprovals={approvalRows.map((approval) => ({
        id: approval.id,
        toolName: approval.toolName,
        toolArgs: approval.toolArgs,
        risk: approval.risk,
        status: approval.status,
        messageId: approval.messageId,
        taskId: approval.taskId,
      }))}
      experts={expertRows.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        icon: item.icon,
        accent: item.accent,
        category: item.category,
        modelId: item.modelId,
        defaultMode: item.defaultMode,
        toolPolicy: item.toolPolicy,
        visibility: item.visibility,
      }))}
      initialExpertId={thread.expertId}
      initialMode={thread.mode}
      demoMode={providerRows.length === 0}
      modelLabel={expert?.modelId || providerRows[0]?.defaultModel || 'Cuter 演示模型'}
    />
  );
}
