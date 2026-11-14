import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { approvals, artifacts, messages, threads, type MessagePart } from '@/server/db/schema';
import { compactMessageParts, reconcileApprovalParts } from '@/server/agent/message-parts';
import { ApiError, errorResponse, json, requireApi } from '@/server/http';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const db = await getDb();
    const threadRows = await db
      .select()
      .from(threads)
      .where(and(eq(threads.id, id), eq(threads.orgId, auth.org.id)))
      .limit(1);
    const thread = threadRows[0];
    if (!thread) throw new ApiError(404, '会话不存在');
    if (thread.userId !== auth.user.id) throw new ApiError(403, '无权访问该会话');

    const [messageRows, approvalRows, artifactRows] = await Promise.all([
      db
        .select({
          id: messages.id,
          role: messages.role,
          parts: messages.parts,
          content: messages.content,
          status: messages.status,
          model: messages.model,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.threadId, id))
        .orderBy(asc(messages.createdAt))
        .limit(200),
      db
        .select({
          id: approvals.id,
          messageId: approvals.messageId,
          toolName: approvals.toolName,
          risk: approvals.risk,
          status: approvals.status,
        })
        .from(approvals)
        .where(and(eq(approvals.threadId, id), eq(approvals.status, 'pending'))),
      db
        .select({
          id: artifacts.id,
          name: artifacts.name,
          mime: artifacts.mime,
          size: artifacts.size,
          kind: artifacts.kind,
          taskId: artifacts.taskId,
        })
        .from(artifacts)
        .where(eq(artifacts.threadId, id))
        .orderBy(asc(artifacts.createdAt)),
    ]);

    const pendingIds = new Set(approvalRows.map((row) => row.id));
    return json(
      {
        messages: messageRows.map((message) => ({
          ...message,
          parts: compactMessageParts(
            reconcileApprovalParts(
              (message.parts || []) as MessagePart[],
              message.status,
              pendingIds,
            ),
          ),
        })),
        approvals: approvalRows,
        artifacts: artifactRows,
      },
      200,
      { 'cache-control': 'no-store' },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
