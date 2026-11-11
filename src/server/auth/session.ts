import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, gt } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import {
  memberships,
  orgs,
  sessions,
  users,
  type Org,
  type Role,
  type User,
} from '@/server/db/schema';
import { newId } from '@/server/ids';
import { randomToken, sha256 } from '@/server/security/crypto';
import { env } from '@/server/env';

export const SESSION_COOKIE = 'cuter_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthContext = {
  user: Pick<User, 'id' | 'email' | 'name' | 'avatarColor'>;
  org: Pick<Org, 'id' | 'name' | 'slug' | 'settings' | 'tokenQuotaMonthly' | 'plan'>;
  role: Role;
  sessionId: string;
  ip: string;
};

export async function createSession(params: {
  userId: string;
  orgId: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ token: string; expires: Date }> {
  const db = await getDb();
  const token = randomToken(32);
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: newId('ses'),
    tokenHash: sha256(token),
    userId: params.userId,
    orgId: params.orgId,
    ip: params.ip || '',
    userAgent: (params.userAgent || '').slice(0, 400),
    expiresAt: expires,
  });
  return { token, expires };
}

export async function setSessionCookie(token: string, expires: Date): Promise<void> {
  const store = await cookies();
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    (process.env.COOKIE_SECURE !== 'false' && env.APP_URL.startsWith('https://'));
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', expires: new Date(0) });
}

export async function destroyCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
  await clearSessionCookie();
}

async function loadSession(token: string): Promise<AuthContext | null> {
  const db = await getDb();
  const rows = await db
    .select({
      sessionId: sessions.id,
      ip: sessions.ip,
      role: memberships.role,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        avatarColor: users.avatarColor,
      },
      org: {
        id: orgs.id,
        name: orgs.name,
        slug: orgs.slug,
        settings: orgs.settings,
        tokenQuotaMonthly: orgs.tokenQuotaMonthly,
        plan: orgs.plan,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(
      memberships,
      and(eq(memberships.userId, sessions.userId), eq(memberships.orgId, sessions.orgId)),
    )
    .innerJoin(orgs, eq(orgs.id, sessions.orgId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    user: row.user,
    org: row.org,
    role: row.role,
    sessionId: row.sessionId,
    ip: row.ip || '',
  };
}

/** 页面渲染用：未登录返回 null */
export async function getAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await loadSession(token);
  } catch (err) {
    console.error('[cuter] 会话校验失败', err);
    return null;
  }
}

/** 页面渲染用：未登录跳转登录页 */
export async function requirePageAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect('/login');
  return auth;
}
