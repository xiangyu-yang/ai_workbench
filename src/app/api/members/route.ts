import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { memberships, users } from '@/server/db/schema';
import { errorResponse, json, requireApi } from '@/server/http';

export async function GET() {
  try {
    const auth = await requireApi('viewer');
    const db = await getDb();
    const rows = await db
      .select({
        membershipId: memberships.id,
        role: memberships.role,
        joinedAt: memberships.createdAt,
        userId: users.id,
        name: users.name,
        email: users.email,
        avatarColor: users.avatarColor,
        lastLoginAt: users.lastLoginAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, auth.org.id))
      .orderBy(asc(memberships.createdAt));
    return json({ members: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
