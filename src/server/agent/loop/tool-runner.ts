import type { ToolPart } from '@/server/db/schema';
import type { ToolResult } from '../tools/types';

/** 把工具执行结果写回消息 part，保证正常路径和审批恢复路径一致。 */
export function applyToolResult(part: ToolPart, result: ToolResult, durationMs: number): void {
  part.status = result.isError ? 'error' : 'ok';
  part.output = result.content;
  part.summary = result.summary || (result.isError ? '执行失败' : '已完成');
  part.durationMs = Math.max(0, durationMs);
}
