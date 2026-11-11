import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { invites } from '@/server/db/schema';
import { newId, shortToken } from '@/server/ids';
import { APP_URL } from '@/server/env';
import { audit } from '@/server/audit';
import {
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(['admin', 'member', 'viewer']).default('member'),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

export async function GET() {
  try {
    const auth = await requireApi('admin');
    const db = await getDb();
    const rows = await db
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.orgId, auth.org.id),
          isNull(invites.acceptedAt),
          gt(invites.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(invites.createdAt));
    return json({
      invites: rows.map((row) => ({
        ...row,
        url: `${APP_URL}/register?invite=${row.code}`,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const input = Body.parse(await readJson(req));
    const db = await getDb();
    const id = newId('inv');
    const code = `${shortToken(4)}${shortToken(6)}`;
    await db.insert(invites).values({
      id,
      orgId: auth.org.id,
      email: input.email,
      role: input.role,
      code,
      invitedBy: auth.user.id,
      expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 3600 * 1000),
    });
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'invite.create',
      { type: 'invite', id },
      { email: input.email, role: input.role },
    );
    return json(
      {
        ok: true,
        invite: {
          id,
          email: input.email,
          role: input.role,
          code,
          url: `${APP_URL}/register?invite=${code}`,
        },
      },
      201,
    );
  } catch (err) {
    return errorResponse(err);
  }
}
