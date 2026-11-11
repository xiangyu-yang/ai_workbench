import { and, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { invites, memberships, orgs, users } from '@/server/db/schema';
import { hashPassword, validateEmail, validatePassword } from '@/server/auth/password';
import { createSession, setSessionCookie } from '@/server/auth/session';
import { newId, shortToken, slugify } from '@/server/ids';
import { provisionOrg } from '@/server/provision';
import { audit } from '@/server/audit';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  getIp,
  json,
  rateLimit,
  readJson,
} from '@/server/http';

const Body = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().min(8).max(200),
  orgName: z.string().trim().max(80).optional(),
  inviteCode: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ip = getIp(req);
    rateLimit(`register:${ip}`, 8, 3600_000);
    const body = Body.parse(await readJson(req));

    const emailError = validateEmail(body.email);
    if (emailError) throw new ApiError(422, emailError);
    const passwordError = validatePassword(body.password);
    if (passwordError) throw new ApiError(422, passwordError);

    const db = await getDb();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).limit(1);
    if (existing.length) throw new ApiError(409, '该邮箱已注册，请直接登录', 'email_taken');

    let orgId: string;
    let role: 'owner' | 'admin' | 'member' | 'viewer' = 'owner';
    let invite: typeof invites.$inferSelect | undefined;

    if (body.inviteCode) {
      const rows = await db
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.code, body.inviteCode),
            isNull(invites.acceptedAt),
            gt(invites.expiresAt, new Date()),
          ),
        )
        .limit(1);
      invite = rows[0];
      if (!invite) throw new ApiError(400, '邀请码无效或已过期', 'invalid_invite');
      if (invite.email.toLowerCase() !== body.email) {
        throw new ApiError(403, '该邀请仅限指定邮箱使用', 'invite_email_mismatch');
      }
      orgId = invite.orgId;
      role = invite.role;
    } else {
      orgId = newId('org');
      const slugBase = slugify(body.orgName || `${body.name}-workspace`, 'workspace');
      const slug = `${slugBase}-${shortToken(5)}`.slice(0, 60);
      await db.insert(orgs).values({
        id: orgId,
        name: body.orgName || `${body.name} 的工作区`,
        slug,
        plan: 'enterprise',
        tokenQuotaMonthly: 5_000_000,
        settings: { allowSignup: true },
      });
    }

    const userId = newId('usr');
    const palette = ['#7c6cff', '#22d3ee', '#f59e0b', '#34d399', '#f472b6'];
    await db.insert(users).values({
      id: userId,
      email: body.email,
      name: body.name,
      passwordHash: await hashPassword(body.password),
      avatarColor: palette[Math.floor(Math.random() * palette.length)],
    });
    await db.insert(memberships).values({
      id: newId('mem'),
      orgId,
      userId,
      role,
    });

    if (invite) {
      await db
        .update(invites)
        .set({ acceptedAt: new Date(), acceptedBy: userId })
        .where(eq(invites.id, invite.id));
    }

    await provisionOrg({ orgId, userId });

    const session = await createSession({
      userId,
      orgId,
      ip,
      userAgent: req.headers.get('user-agent') || '',
    });
    await setSessionCookie(session.token, session.expires);
    await audit({ orgId, actorId: userId, ip }, 'auth.register', { type: 'user', id: userId }, {
      email: body.email,
      invite: Boolean(invite),
    });

    return json({ ok: true, orgId, userId });
  } catch (err) {
    return errorResponse(err);
  }
}
