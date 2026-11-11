'use client';

import * as React from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Loader2,
  ShieldAlert,
  X,
  Wrench,
} from 'lucide-react';
import type { ChatPart } from '@/lib/chat-types';
import { cn } from '@/lib/utils';

type ToolPart = Extract<ChatPart, { type: 'tool' }>;

const STATUS_STYLE: Record<ToolPart['status'], string> = {
  running: 'border-cyan/20 bg-cyan/[0.04]',
  ok: 'border-line bg-surface-2',
  error: 'border-danger/20 bg-danger/[0.04]',
  pending_approval: 'border-warning/25 bg-warning/[0.05]',
  denied: 'border-line bg-surface-2',
};

export function ToolCard({
  part,
  onApprove,
  onDeny,
  approvalRisk,
}: {
  part: ToolPart;
  onApprove?: (approvalId: string) => void;
  onDeny?: (approvalId: string) => void;
  approvalRisk?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const title = part.title || part.name.replace(/^mcp_\d+_/, '').replace(/_/g, ' ');
  const pending = part.status === 'pending_approval';
  const args = part.args ? JSON.stringify(part.args, null, 2) : '';

  return (
    <div className={cn('overflow-hidden rounded-xl border text-[12px]', STATUS_STYLE[part.status])}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-surface-2"
      >
        <span
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
            pending
              ? 'border-warning/30 bg-warning/10 text-warning'
              : part.status === 'error'
                ? 'border-danger/30 bg-danger/10 text-danger'
                : 'border-line bg-surface-2 text-muted',
          )}
        >
          {part.status === 'running' ? (
            <Loader2 size={12} className="animate-spin" />
          ) : pending ? (
            <ShieldAlert size={12} />
          ) : part.status === 'error' ? (
            <AlertCircle size={12} />
          ) : part.status === 'denied' ? (
            <X size={12} />
          ) : (
            <Wrench size={12} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate font-medium text-ink">{title}</span>
            {part.status === 'ok' ? <Check size={11} className="text-success" /> : null}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-faint">
            {part.summary || (part.status === 'running' ? '执行中…' : part.name)}
            {part.durationMs ? ` · ${(part.durationMs / 1000).toFixed(1)}s` : ''}
          </span>
        </span>
        <ChevronDown
          size={13}
          className={cn('shrink-0 text-faint transition-transform', open && 'rotate-180')}
        />
      </button>

      {pending && part.approvalId ? (
        <div className="border-t border-warning/20 bg-warning/[0.03] px-3 py-2.5">
          <p className="text-[11.5px] leading-relaxed text-warning/90">
            {approvalRisk || '该操作需要人工确认后才会执行。'}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => onApprove?.(part.approvalId as string)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-success/30 bg-success/10 px-2.5 text-[11px] font-medium text-success transition hover:bg-success/15"
            >
              <Check size={11} />
              批准执行
            </button>
            <button
              type="button"
              onClick={() => onDeny?.(part.approvalId as string)}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface-2 px-2.5 text-[11px] text-muted transition hover:text-ink"
            >
              <X size={11} />
              拒绝
            </button>
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2.5 border-t border-line/70 px-3 py-3">
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-faint">参数</p>
            <pre className="max-h-48 overflow-auto rounded-lg bg-black/40 p-2.5 font-mono text-[10.5px] leading-relaxed text-muted">
              {args || '（无参数）'}
            </pre>
          </div>
          {part.output ? (
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-faint">输出</p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2.5 font-mono text-[10.5px] leading-relaxed text-muted">
                {part.output}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
