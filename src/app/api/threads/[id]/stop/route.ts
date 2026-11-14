import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { approvals, messages, threads, type MessagePart } from '@/server/db/schema';
import { ApiError, assertSameOrigin, errorResponse, json, requireApi } from '@/server/http';
import { stopAgentRun } from '@/server/agent/run-manager';
import { reconcileApprovalParts } from '@/server/agent/message-parts';
import { audit } from '@/server/audit';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const db = await getDb();
    const threadRows = await db
      .select()
      .from(threads)
      .where(and(eq(threads.id, id), eq(threads.orgId, auth.org.id)))
      .limit(1);
    const thread = threadRows[0];
    if (!thread) throw new ApiError(404, '会话不存在');
    if (thread.userId !== auth.user.id) throw new ApiError(403, '无权操作该会话');

    const activeRows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.orgId, auth.org.id),
          eq(messages.threadId, id),
          inArray(messages.status, ['streaming', 'awaiting_approval']),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);
    const active = activeRows[0];
    if (!active) throw new ApiError(409, '该会话当前没有正在执行或等待审批的内容', 'not_busy');

    const stopped = stopAgentRun(active.id);
    const now = new Date();
    await db
      .update(messages)
      .set({
        status: 'cancelled',
        parts: reconcileApprovalParts(
          (active.parts || []) as MessagePart[],
          'cancelled',
          new Set(),
        ),
      })
      .where(eq(messages.id, active.id));
    await db
      .update(approvals)
      .set({ status: 'denied', decidedBy: auth.user.id, decidedAt: now })
      .where(and(eq(approvals.messageId, active.id), eq(approvals.status, 'pending')));

    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'thread.force_stop',
      { type: 'message', id: active.id },
      { threadId: id, runHandleStopped: stopped },
    );
    return json({ ok: true, messageId: active.id, active: stopped });
  } catch (err) {
    return errorResponse(err);
  }
}
