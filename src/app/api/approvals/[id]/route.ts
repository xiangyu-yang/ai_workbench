import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { approvals, messages } from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';
import { resumeTask } from '@/server/tasks/runner';

const Body = z.object({ decision: z.enum(['approved', 'denied']) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const body = Body.parse(await readJson(req));
    const db = await getDb();

    const rows = await db
      .select()
      .from(approvals)
      .where(and(eq(approvals.id, id), eq(approvals.orgId, auth.org.id)))
      .limit(1);
    const approval = rows[0];
    if (!approval) throw new ApiError(404, '审批单不存在');
    if (approval.status !== 'pending') throw new ApiError(409, '该审批已处理', 'already_decided');

    await db
      .update(approvals)
      .set({
        status: body.decision === 'approved' ? 'approved' : 'denied',
        decidedBy: auth.user.id,
        decidedAt: new Date(),
      })
      .where(eq(approvals.id, id));

    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      `approval.${body.decision}`,
      { type: 'approval', id },
      { toolName: approval.toolName, taskId: approval.taskId },
    );

    let ready = false;
    if (approval.messageId) {
      const remaining = await db
        .select({ id: approvals.id })
        .from(approvals)
        .where(
          and(
            eq(approvals.orgId, auth.org.id),
            eq(approvals.messageId, approval.messageId),
            eq(approvals.status, 'pending'),
          ),
        )
        .limit(1);
      ready = remaining.length === 0;
    }

    if (ready && approval.taskId) {
      void resumeTask(approval.taskId).catch((err) =>
        console.error('[cuter] 任务恢复失败', err),
      );
    }

    return json({
      ok: true,
      ready,
      messageId: approval.messageId,
      taskId: approval.taskId,
      status: body.decision,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
