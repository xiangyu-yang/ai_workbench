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
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

const PatchBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
});

async function ownThread(orgId: string, userId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(threads)
    .where(and(eq(threads.id, id), eq(threads.orgId, orgId)))
    .limit(1);
  const thread = rows[0];
  if (!thread) throw new ApiError(404, '会话不存在');
  if (thread.userId !== userId) throw new ApiError(403, '无权操作该会话');
  return thread;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const body = PatchBody.parse(await readJson(req));
    await ownThread(auth.org.id, auth.user.id, id);
    const db = await getDb();
    await db
      .update(threads)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(threads.id, id));
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    await ownThread(auth.org.id, auth.user.id, id);
    const db = await getDb();
    const active = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.threadId, id),
          inArray(messages.status, ['streaming', 'awaiting_approval']),
        ),
      )
      .limit(1);
    if (active.length) {
      throw new ApiError(409, '会话正在执行或等待审批，请先停止后再删除', 'thread_busy');
    }
    await db.delete(messages).where(eq(messages.threadId, id));
    await db.delete(attachments).where(eq(attachments.threadId, id));
    await db.delete(approvals).where(eq(approvals.threadId, id));
    await db.delete(artifacts).where(eq(artifacts.threadId, id));
    await db.delete(runs).where(eq(runs.threadId, id));
    await db.delete(threads).where(eq(threads.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'thread.delete',
      { type: 'thread', id },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
