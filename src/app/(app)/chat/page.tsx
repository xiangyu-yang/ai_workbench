import { and, asc, eq } from 'drizzle-orm';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { apps, experts, modelProviders } from '@/server/db/schema';
import { ChatView } from '@/components/chat/chat-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: '对话' };

export default async function NewChatPage({
  searchParams,
}: {
  searchParams: Promise<{ expert?: string; app?: string }>;
}) {
  const auth = await requirePageAuth();
  const params = await searchParams;
  const db = await getDb();
  const [expertRows, providerRows, appRows] = await Promise.all([
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
    params.app
      ? db
          .select()
          .from(apps)
          .where(and(eq(apps.orgId, auth.org.id), eq(apps.id, params.app), eq(apps.enabled, true)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const launchedApp = appRows[0] || null;
  const requested =
    (params.expert && expertRows.some((expert) => expert.id === params.expert) ? params.expert : null) ||
    (launchedApp?.expertId && expertRows.some((expert) => expert.id === launchedApp.expertId)
      ? launchedApp.expertId
      : null);
  const defaultExpertId =
    requested || auth.org.settings?.defaultExpertId || expertRows[0]?.id || null;
  const defaultExpert = expertRows.find((expert) => expert.id === defaultExpertId);
  const modelLabel =
    defaultExpert?.modelId || providerRows[0]?.defaultModel || 'Cuter 演示模型';

  return (
    <ChatView
      key={`new:${launchedApp?.id || 'none'}`}
      threadId={null}
      initialTitle="新对话"
      initialMessages={[]}
      initialArtifacts={[]}
      initialApprovals={[]}
      experts={expertRows.map((expert) => ({
        id: expert.id,
        name: expert.name,
        description: expert.description,
        icon: expert.icon,
        accent: expert.accent,
        category: expert.category,
        modelId: expert.modelId,
        defaultMode: expert.defaultMode,
        toolPolicy: expert.toolPolicy,
        visibility: expert.visibility,
      }))}
      initialExpertId={defaultExpertId}
      initialMode={defaultExpert?.defaultMode || 'agent'}
      demoMode={providerRows.length === 0}
      modelLabel={modelLabel}
      appLabel={launchedApp?.name}
      appId={launchedApp?.id}
    />
  );
}
