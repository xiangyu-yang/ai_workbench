import { getDb } from '@/server/db/client';
import { approvals } from '@/server/db/schema';
import { newId } from '@/server/ids';

export type ApprovalRequestInput = {
  orgId: string;
  threadId: string;
  messageId: string;
  taskId?: string | null;
  runId: string;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  risk: string;
  ttlMs?: number;
};

/** 持久化一个待审批工具调用；返回前端审批卡片需要的 id。 */
export async function createApprovalRequest(
  input: ApprovalRequestInput,
): Promise<{ id: string; risk: string; expiresAt: Date }> {
  const db = await getDb();
  const id = newId('apr');
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? 24 * 3600 * 1000));
  await db.insert(approvals).values({
    id,
    orgId: input.orgId,
    threadId: input.threadId,
    messageId: input.messageId,
    taskId: input.taskId,
    runId: input.runId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    toolArgs: input.toolArgs,
    risk: input.risk,
    status: 'pending',
    expiresAt,
  });
  return { id, risk: input.risk, expiresAt };
}
