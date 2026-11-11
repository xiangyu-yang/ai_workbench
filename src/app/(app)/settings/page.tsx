import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import {
  apiKeys,
  experts,
  invites,
  memberships,
  modelProviders,
  users,
} from '@/server/db/schema';
import { isAdmin } from '@/server/auth/rbac';
import { APP_URL } from '@/server/env';
import { SettingsView } from '@/components/settings/settings-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: '设置' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const auth = await requirePageAuth();
  const params = await searchParams;
  const db = await getDb();
  const admin = isAdmin(auth.role);

  const [memberRows, inviteRows, providerRows, keyRows, expertRows] = await Promise.all([
    db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        avatarColor: users.avatarColor,
        lastLoginAt: users.lastLoginAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, auth.org.id))
      .orderBy(asc(memberships.createdAt)),
    admin
      ? db
          .select()
          .from(invites)
          .where(
            and(
              eq(invites.orgId, auth.org.id),
              isNull(invites.acceptedAt),
              gt(invites.expiresAt, new Date()),
            ),
          )
          .orderBy(desc(invites.createdAt))
      : Promise.resolve([]),
    admin
      ? db
          .select()
          .from(modelProviders)
          .where(eq(modelProviders.orgId, auth.org.id))
          .orderBy(desc(modelProviders.isDefault), asc(modelProviders.createdAt))
      : Promise.resolve([]),
    admin
      ? db
          .select()
          .from(apiKeys)
          .where(eq(apiKeys.orgId, auth.org.id))
          .orderBy(desc(apiKeys.createdAt))
      : Promise.resolve([]),
    db
      .select({ id: experts.id, name: experts.name, icon: experts.icon, accent: experts.accent })
      .from(experts)
      .where(eq(experts.orgId, auth.org.id))
      .orderBy(asc(experts.createdAt)),
  ]);

  return (
    <SettingsView
      isAdmin={admin}
      initialTab={params.tab || 'general'}
      org={{
        id: auth.org.id,
        name: auth.org.name,
        slug: auth.org.slug,
        plan: auth.org.plan,
        tokenQuotaMonthly: auth.org.tokenQuotaMonthly,
        settings: auth.org.settings,
      }}
      currentUser={{ id: auth.user.id, role: auth.role }}
      members={memberRows.map((member) => ({
        ...member,
        role: member.role as 'owner' | 'admin' | 'member' | 'viewer',
        lastLoginAt: member.lastLoginAt?.toISOString() || null,
      }))}
      invites={inviteRows.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        url: `${APP_URL}/register?invite=${invite.code}`,
      }))}
      providers={providerRows.map((provider) => ({
        id: provider.id,
        name: provider.name,
        kind: provider.kind,
        baseUrl: provider.baseUrl,
        models: provider.models,
        defaultModel: provider.defaultModel,
        embeddingModel: provider.embeddingModel,
        enabled: provider.enabled,
        isDefault: provider.isDefault,
        hasKey: Boolean(provider.apiKeyEnc),
      }))}
      apiKeys={keyRows.map((key) => ({
        id: key.id,
        name: key.name,
        prefix: key.prefix,
        scopes: key.scopes,
        lastUsedAt: key.lastUsedAt?.toISOString() || null,
        expiresAt: key.expiresAt?.toISOString() || null,
        revokedAt: key.revokedAt?.toISOString() || null,
        createdAt: key.createdAt.toISOString(),
      }))}
      experts={expertRows}
    />
  );
}
