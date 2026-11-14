import { and, desc, eq, ilike } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { threads } from '@/server/db/schema';
import { errorResponse, json, requireApi } from '@/server/http';

export async function GET(req: Request) {
  try {
    const auth = await requireApi('viewer');
    const url = new URL(req.url);
    const query = (url.searchParams.get('q') || '').trim();
    const archivedParam = url.searchParams.get('archived');
    const archived = archivedParam === '1' ? true : archivedParam === '0' ? false : null;
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 40)));
    const db = await getDb();
    const rows = await db
      .select({
        id: threads.id,
        title: threads.title,
        expertId: threads.expertId,
        pinned: threads.pinned,
        archived: threads.archived,
        lastMessageAt: threads.lastMessageAt,
      })
      .from(threads)
      .where(
        and(
          eq(threads.orgId, auth.org.id),
          eq(threads.userId, auth.user.id),
          eq(threads.source, 'chat'),
          query ? ilike(threads.title, `%${query}%`) : undefined,
          archived === null ? undefined : eq(threads.archived, archived),
        ),
      )
      .orderBy(desc(threads.pinned), desc(threads.lastMessageAt))
      .limit(limit);
    return json({ threads: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
