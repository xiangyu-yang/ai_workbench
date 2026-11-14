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

const SKIPPED_SUMMARIES = [
  '已读取必要参考资料，跳过重复读取',
  '报告已写入交付物，跳过重复取数',
  '已获取该标的行情，跳过重复扫描',
  '重复调用已跳过',
];

/**
 * 旧消息可能已经累积了几十次被拦截的重复工具调用。读取快照时把纯 no-op
 * 工具卡和完全重复的段落折叠掉，避免历史会话仍然像死循环。
 */
export function compactMessageParts(parts: MessagePart[]): MessagePart[] {
  const result: MessagePart[] = [];
  const seenText = new Set<string>();
  const hasReport =
    parts.some((part) => part.type === 'artifact') ||
    parts.some((part) => part.type === 'text' && part.text.trim().length > 500);
  for (const part of parts) {
    if (
      part.type === 'tool' &&
      part.summary &&
      SKIPPED_SUMMARIES.some((text) => part.summary?.includes(text))
    ) {
      continue;
    }
    if (part.type !== 'text') {
      result.push(part);
      continue;
    }
    const paragraphs = part.text.split(/\n{2,}/);
    const seenParagraphs = new Set<string>();
    const unique = paragraphs.filter((paragraph) => {
      const key = paragraph.replace(/\s+/g, '').trim();
      if (key.length < 60) return true;
      if (seenParagraphs.has(key)) return false;
      seenParagraphs.add(key);
      return true;
    });
    const text = unique.join('\n\n');
    if (!text.trim()) continue;
    if (
      hasReport &&
      text.trim().length < 180 &&
      !/^#{1,6}\s/m.test(text) &&
      /(我将|现在|接下来|让我|收到|开始|首先|基于)/.test(text)
    ) {
      continue;
    }
    const normalized = text.replace(/\s+/g, '').trim();
    const key = normalized.slice(0, 80);
    if (normalized.length >= 30 && seenText.has(key)) continue;
    if (normalized.length >= 30) seenText.add(key);
    result.push({ ...part, text });
  }
  return result;
}
