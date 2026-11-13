import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { approvals, messages, threads } from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { stopAgentRun } from '@/server/agent/run-manager';

const Body = z.object({ messageId: z.string().min(1) });

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { messageId } = Body.parse(await readJson(req));
    const db = await getDb();
    const rows = await db
      .select({ message: messages, thread: threads })
      .from(messages)
      .innerJoin(threads, eq(threads.id, messages.threadId))
      .where(and(eq(messages.id, messageId), eq(messages.orgId, auth.org.id)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new ApiError(404, '消息不存在');
    if (row.thread.userId !== auth.user.id) throw new ApiError(403, '无权操作该会话');

    const active = stopAgentRun(messageId);
    if (!active && ['streaming', 'awaiting_approval'].includes(row.message.status)) {
      // 服务重启或跨进程运行时，至少把持久化状态收敛，避免界面永久转圈。
      await db
        .update(messages)
        .set({ status: 'cancelled' })
        .where(eq(messages.id, messageId));
      await db
        .update(approvals)
        .set({ status: 'denied', decidedBy: auth.user.id, decidedAt: new Date() })
        .where(and(eq(approvals.messageId, messageId), eq(approvals.status, 'pending')));
    }
    return json({ ok: true, active });
  } catch (err) {
    return errorResponse(err);
  }
}
