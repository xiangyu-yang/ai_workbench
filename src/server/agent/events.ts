import type { CitationPart, MessagePart, MessageStatus, SkillPart } from '@/server/db/schema';

export type RuntimeEvent =
  | { type: 'meta'; runId: string; messageId: string; threadId?: string; taskId?: string }
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'skill'; part: SkillPart }
  | { type: 'tool_start'; id: string; name: string; title?: string }
  | {
      type: 'tool_result';
      id: string;
      name: string;
      status: 'ok' | 'error' | 'denied' | 'pending_approval';
      summary?: string;
      output?: string;
      durationMs?: number;
      approvalId?: string;
    }
  | {
      type: 'artifact';
      artifact: { id: string; name: string; mime: string; size: number; kind: string };
    }
  | { type: 'citation'; citation: CitationPart }
  | {
      type: 'approval';
      approval: {
        id: string;
        toolName: string;
        toolArgs: Record<string, unknown>;
        risk: string;
        messageId: string;
        taskId?: string;
      };
    }
  | { type: 'usage'; inputTokens: number; outputTokens: number; costUsd: number }
  | { type: 'parts'; parts: MessagePart[] }
  | { type: 'status'; status: MessageStatus }
  | { type: 'error'; message: string }
  | { type: 'done'; messageId: string; status: MessageStatus; content: string };

export type Emit = (event: RuntimeEvent) => void | Promise<void>;
