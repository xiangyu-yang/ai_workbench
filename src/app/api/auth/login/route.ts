import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { memberships, users } from '@/server/db/schema';
import { verifyPassword } from '@/server/auth/password';
import { createSession, setSessionCookie } from '@/server/auth/session';
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
  email: z.string().trim().toLowerCase().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const ip = getIp(req);
    const body = Body.parse(await readJson(req));
    rateLimit(`login:${ip}:${body.email}`, 10, 600_000);

    const db = await getDb();
    const rows = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    const user = rows[0];
    const valid = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new ApiError(401, '邮箱或密码不正确', 'invalid_credentials');
    }

    const memberRows = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .orderBy(asc(memberships.createdAt))
      .limit(1);
    const membership = memberRows[0];
    if (!membership) throw new ApiError(403, '账号未加入任何组织', 'no_org');

    const session = await createSession({
      userId: user.id,
      orgId: membership.orgId,
      ip,
      userAgent: req.headers.get('user-agent') || '',
    });
    await setSessionCookie(session.token, session.expires);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await audit(
      { orgId: membership.orgId, actorId: user.id, ip },
      'auth.login',
      { type: 'user', id: user.id },
      { email: user.email },
    );

    return json({ ok: true, role: membership.role });
  } catch (err) {
    return errorResponse(err);
  }
}
