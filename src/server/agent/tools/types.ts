import type { Emit } from '@/server/agent/events';
import type { CitationPart } from '@/server/db/schema';

export type ArtifactRef = {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: string;
};

export type ToolResult = {
  content: string;
  summary?: string;
  isError?: boolean;
  citations?: CitationPart[];
  artifacts?: ArtifactRef[];
};

export type ToolContext = {
  orgId: string;
  userId: string;
  expertId?: string | null;
  threadId?: string | null;
  taskId?: string | null;
  messageId?: string | null;
  runId?: string | null;
  scopeId: string;
  mode: string;
  signal?: AbortSignal;
  emit: Emit;
  kbIds: string[];
  delegate?: (expertId: string, goal: string) => Promise<string>;
};

export type RuntimeTool = {
  name: string;
  title?: string;
  description: string;
  parameters: Record<string, unknown>;
  dangerous?: boolean;
  /** 只读工具（always 策略下也不打断） */
  readonly?: boolean;
  /** 无论工具策略如何，都必须人工审批（如执行技能脚本） */
  alwaysApprove?: boolean;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

export type ToolPolicy = 'never' | 'dangerous' | 'always';
