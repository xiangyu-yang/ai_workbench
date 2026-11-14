import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import {
  approvals,
  artifacts,
  attachments,
  messages,
  runs,
  threads,
} from '@/server/db/schema';
import { ApiError, assertSameOrigin, errorResponse, json, readJson, requireApi } from '@/server/http';
import { audit } from '@/server/audit';

const Body = z.object({
  ids: z.array(z.string()).min(1).max(100),
  action: z.enum(['archive', 'unarchive', 'delete']),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const body = Body.parse(await readJson(req));
    const ids = [...new Set(body.ids.filter(Boolean))];
    const db = await getDb();
    const owned = await db
      .select({ id: threads.id })
      .from(threads)
      .where(
        and(
          eq(threads.orgId, auth.org.id),
          eq(threads.userId, auth.user.id),
          inArray(threads.id, ids),
        ),
      );
    const ownedIds = owned.map((row) => row.id);
    if (!ownedIds.length) throw new ApiError(404, '没有可操作的会话');

    if (body.action === 'delete') {
      const active = await db
        .select({ id: messages.threadId })
        .from(messages)
        .where(
          and(
            inArray(messages.threadId, ownedIds),
            inArray(messages.status, ['streaming', 'awaiting_approval']),
          ),
        )
        .limit(1);
      if (active.length) {
        throw new ApiError(409, '选中会话中有正在执行或等待审批的内容，请先点击「强制结束」后再删除', 'thread_busy');
      }
      await db.delete(messages).where(inArray(messages.threadId, ownedIds));
      await db.delete(attachments).where(inArray(attachments.threadId, ownedIds));
      await db.delete(approvals).where(inArray(approvals.threadId, ownedIds));
      await db.delete(artifacts).where(inArray(artifacts.threadId, ownedIds));
      await db.delete(runs).where(inArray(runs.threadId, ownedIds));
      await db.delete(threads).where(inArray(threads.id, ownedIds));
    } else {
      await db
        .update(threads)
        .set({ archived: body.action === 'archive', updatedAt: new Date() })
        .where(inArray(threads.id, ownedIds));
    }

    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      body.action === 'delete' ? 'thread.batch_delete' : `thread.batch_${body.action}`,
      { type: 'thread', id: ownedIds.join(',') },
      { count: ownedIds.length, ids: ownedIds },
    );
    return json({ ok: true, affected: ownedIds.length, skipped: ids.length - ownedIds.length });
  } catch (err) {
    return errorResponse(err);
  }
}
