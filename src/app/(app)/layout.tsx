import { and, desc, eq } from 'drizzle-orm';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { modelProviders, threads } from '@/server/db/schema';
import { AppShell } from '@/components/app-shell';
import { ensureScheduler } from '@/server/tasks/runner';
import type { Role } from '@/server/db/schema';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await requirePageAuth();
  ensureScheduler();
  const db = await getDb();

  const [recentRows, providerRows] = await Promise.all([
    db
      .select({ id: threads.id, title: threads.title, lastMessageAt: threads.lastMessageAt })
      .from(threads)
      .where(
        and(
          eq(threads.orgId, auth.org.id),
          eq(threads.userId, auth.user.id),
          eq(threads.source, 'chat'),
          eq(threads.archived, false),
        ),
      )
      .orderBy(desc(threads.lastMessageAt))
      .limit(8),
    db
      .select({ id: modelProviders.id })
      .from(modelProviders)
      .where(and(eq(modelProviders.orgId, auth.org.id), eq(modelProviders.enabled, true)))
      .limit(1),
  ]);

  return (
    <AppShell
      user={{
        id: auth.user.id,
        name: auth.user.name,
        email: auth.user.email,
        role: auth.role as Role,
        avatarColor: auth.user.avatarColor,
        orgName: auth.org.name,
        orgPlan: auth.org.plan,
      }}
      recent={recentRows.map((row) => ({
        id: row.id,
        title: row.title,
        lastMessageAt: row.lastMessageAt.toISOString(),
      }))}
      demoMode={providerRows.length === 0}
    >
      {children}
    </AppShell>
  );
}
