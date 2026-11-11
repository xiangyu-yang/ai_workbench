import { and, desc, eq, ilike } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { auditLogs, users } from '@/server/db/schema';
import { errorResponse, json, requireApi } from '@/server/http';

export async function GET(req: Request) {
  try {
    const auth = await requireApi('admin');
    const url = new URL(req.url);
    const action = (url.searchParams.get('action') || '').trim();
    const limit = Math.min(Number(url.searchParams.get('limit') || 80), 200);
    const db = await getDb();
    const rows = await db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        metadata: auditLogs.metadata,
        ip: auditLogs.ip,
        createdAt: auditLogs.createdAt,
        actorName: users.name,
        actorEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorId))
      .where(
        and(
          eq(auditLogs.orgId, auth.org.id),
          action ? ilike(auditLogs.action, `%${action}%`) : undefined,
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
    return json({ logs: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
