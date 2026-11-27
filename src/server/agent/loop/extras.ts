import type { MessagePart } from '@/server/db/schema';
import type { RuntimeEvent } from '../events';
import type { ToolResult } from '../tools/types';

/** 把工具结果中的引用和交付物转成消息 parts，并立即推送 SSE。 */
export async function applyResultExtras(
  result: ToolResult,
  parts: MessagePart[],
  send: (event: RuntimeEvent) => void,
  callId: string,
): Promise<void> {
  if (result.citations?.length) {
    const startIndex = parts.filter((p) => p.type === 'citation').length;
    for (const [index, citation] of result.citations.entries()) {
      const item = { ...citation, index: startIndex + index + 1 };
      parts.push(item);
      send({ type: 'citation', citation: item });
    }
  }
  if (result.artifacts?.length) {
    for (const artifact of result.artifacts) {
      parts.push({
        type: 'artifact',
        artifactId: artifact.id,
        name: artifact.name,
        mime: artifact.mime,
        size: artifact.size,
        kind: artifact.kind as 'document' | 'data' | 'code' | 'image' | 'other',
      });
      send({ type: 'artifact', artifact });
    }
  }
  void callId;
}
