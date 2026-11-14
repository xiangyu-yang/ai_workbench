import type { MessagePart } from '@/server/db/schema';

/**
 * 消息已经结束（完成/停止/失败）或审批记录已不存在时，历史 parts 里的
 * pending_approval 会让前端一直渲染“待审批”按钮。读取快照时统一收敛，
 * 避免刷新或切换会话后再次出现幽灵审批卡片。
 */
export function reconcileApprovalParts(
  parts: MessagePart[],
  status: string,
  pendingApprovalIds: Set<string>,
): MessagePart[] {
  return parts.map((part) => {
    if (part.type !== 'tool' || part.status !== 'pending_approval') return part;
    const stillValid =
      status === 'awaiting_approval' &&
      Boolean(part.approvalId) &&
      pendingApprovalIds.has(part.approvalId as string);
    if (stillValid) return part;
    return {
      ...part,
      status: 'denied',
      summary:
        status === 'cancelled'
          ? '会话已停止，审批已取消'
          : '审批已失效，消息已结束；如需继续，请重新发起该操作',
    };
  });
}
