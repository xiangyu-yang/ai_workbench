import { and, desc, eq, ilike, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { messages, threads } from '@/server/db/schema';
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
    const statusRows = rows.length
      ? await db
          .select({ threadId: messages.threadId, status: messages.status })
          .from(messages)
          .where(
            and(
              eq(messages.orgId, auth.org.id),
              inArray(messages.threadId, rows.map((row) => row.id)),
              inArray(messages.status, ['streaming', 'awaiting_approval']),
            ),
          )
      : [];
    const statusByThread = new Map<string, 'streaming' | 'awaiting_approval'>();
    for (const row of statusRows) {
      const current = statusByThread.get(row.threadId);
      if (row.status === 'awaiting_approval' || !current) {
        statusByThread.set(row.threadId, row.status as 'streaming' | 'awaiting_approval');
      }
    }
    return json({
      threads: rows.map((row) => ({
        ...row,
        busyStatus: statusByThread.get(row.id) || null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
