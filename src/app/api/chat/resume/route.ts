import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { messages, threads } from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  readJson,
  requireApi,
  sseResponse,
} from '@/server/http';
import { isAgentRunActive, startAgentRun } from '@/server/agent/run-manager';

const Body = z.object({ messageId: z.string() });

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
    if (!['awaiting_approval', 'streaming'].includes(row.message.status)) {
      throw new ApiError(409, '该消息当前无需恢复', 'not_resumable');
    }

    if (isAgentRunActive(messageId)) {
      throw new ApiError(409, '消息正在生成，请等待当前输出完成', 'run_active');
    }

    return sseResponse(async (send) => {
      const run = startAgentRun({
        orgId: auth.org.id,
        userId: auth.user.id,
        threadId: row.thread.id,
        messageId,
        mode: row.thread.mode as 'ask' | 'plan' | 'agent',
        resume: true,
        emit: (event) => send(event.type, event),
      });
      await run.promise;
    });
  } catch (err) {
    return errorResponse(err);
  }
}
