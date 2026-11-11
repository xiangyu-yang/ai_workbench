import { and, desc, eq, ilike } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { threads } from '@/server/db/schema';
import { errorResponse, json, requireApi } from '@/server/http';

export async function GET(req: Request) {
  try {
    const auth = await requireApi('viewer');
    const url = new URL(req.url);
    const query = (url.searchParams.get('q') || '').trim();
    const db = await getDb();
    const rows = await db
      .select({
        id: threads.id,
        title: threads.title,
        expertId: threads.expertId,
        pinned: threads.pinned,
        lastMessageAt: threads.lastMessageAt,
      })
      .from(threads)
      .where(
        and(
          eq(threads.orgId, auth.org.id),
          eq(threads.userId, auth.user.id),
          eq(threads.source, 'chat'),
          query ? ilike(threads.title, `%${query}%`) : undefined,
        ),
      )
      .orderBy(desc(threads.pinned), desc(threads.lastMessageAt))
      .limit(40);
    return json({ threads: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
