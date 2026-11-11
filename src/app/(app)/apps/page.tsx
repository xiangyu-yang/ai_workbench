import { asc, eq } from 'drizzle-orm';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { apps, experts } from '@/server/db/schema';
import { AppCenter } from '@/components/apps/app-center';

export const dynamic = 'force-dynamic';
export const metadata = { title: '应用中心' };

export default async function AppsPage() {
  const auth = await requirePageAuth();
  const db = await getDb();
  const [appRows, expertRows] = await Promise.all([
    db
      .select({ app: apps, expertName: experts.name })
      .from(apps)
      .leftJoin(experts, eq(experts.id, apps.expertId))
      .where(eq(apps.orgId, auth.org.id))
      .orderBy(asc(apps.sortOrder), asc(apps.createdAt)),
    db
      .select({ id: experts.id, name: experts.name, icon: experts.icon, accent: experts.accent })
      .from(experts)
      .where(eq(experts.orgId, auth.org.id))
      .orderBy(asc(experts.name)),
  ]);

  return (
    <AppCenter
      canManage={auth.role === 'owner' || auth.role === 'admin'}
      experts={expertRows}
      apps={appRows.map((row) => ({
        id: row.app.id,
        name: row.app.name,
        description: row.app.description,
        category: row.app.category,
        icon: row.app.icon,
        accent: row.app.accent,
        type: row.app.type,
        url: row.app.url,
        expertId: row.app.expertId,
        expertName: row.expertName || null,
        enabled: row.app.enabled,
        sortOrder: row.app.sortOrder,
        lastOpenedAt: row.app.lastOpenedAt ? row.app.lastOpenedAt.toISOString() : null,
      }))}
    />
  );
}
