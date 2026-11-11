'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Square,
  X,
  XCircle,
} from 'lucide-react';
import { ExpertAvatar } from '@/components/brand';
import { Badge, Button, Card, ErrorBox, Modal, Progress, Spinner } from '@/components/ui';
import { Markdown } from '@/components/chat/markdown';
import { ToolCard } from '@/components/chat/tool-card';
import { ArtifactPanel } from '@/components/chat/artifact-panel';
import { useToast } from '@/components/toast';
import type { ArtifactInfo, ChatPart } from '@/lib/chat-types';
import { bytes, cn, relativeTime, statusLabel } from '@/lib/utils';

type Data = {
  task: {
    id: string;
    title: string;
    goal: string;
    status: string;
    progress: number;
    expertId: string | null;
    error: string;
    resultSummary: string;
    runCount: number;
    schedule: { enabled: boolean; cron?: string; nextRunAt?: string | null };
    nextRunAt: string | null;
    lastRunAt: string | null;
    createdAt: string;
    startedAt: string | null;
    finishedAt: string | null;
  };
  expert: { id: string; name: string; icon: string; accent: string } | null;
  steps: Array<{
    id: string;
    ordinal: number;
    title: string;
    detail: string;
    status: string;
  }>;
  events: Array<{
    id: string;
    seq: number;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
  artifacts: ArtifactInfo[];
  approvals: Array<{
    id: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
    risk: string;
    status: string;
    messageId: string | null;
    taskId: string | null;
  }>;
  messages: Array<{
    id: string;
    role: string;
    parts: ChatPart[];
    content: string;
    status: string;
    createdAt: string;
  }>;
};

const ACTIVE_STATUS = ['queued', 'planning', 'running', 'waiting_approval'];

const EVENT_LABEL: Record<string, string> = {
  'task.created': '创建任务',
  'task.running': '开始执行',
  'task.plan': '生成执行计划',
  'task.step': '步骤更新',
  'tool.start': '调用工具',
  'tool.result': '工具返回',
  'task.approval': '请求人工审批',
  'task.artifact': '生成交付物',
  'task.completed': '交付完成',
  'task.failed': '执行失败',
  'task.error': '执行错误',
  'task.status': '状态变更',
  'task.scheduled': '定时触发',
  'task.retry': '重试任务',
  'task.cancelled': '取消任务',
};

export function TaskDetail({ initial }: { initial: Data }) {
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = React.useState<Data>(initial);
  const [preview, setPreview] = React.useState<ArtifactInfo | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [deciding, setDeciding] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/tasks/${initial.task.id}`, { cache: 'no-store' });
      if (!response.ok) return;
      const payload = (await response.json()) as Data;
      setData(payload);
    } catch {
      /* transient */
    }
  }, [initial.task.id]);

  React.useEffect(() => {
    if (!ACTIVE_STATUS.includes(data.task.status)) return;
    const timer = setInterval(() => void refresh(), 2500);
    return () => clearInterval(timer);
  }, [data.task.status, refresh]);

  const decide = async (approvalId: string, decision: 'approved' | 'denied') => {
    setDeciding(approvalId);
    try {
      const response = await fetch(`/api/approvals/${approvalId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const payload = (await response.json()) as { error?: string; ready?: boolean };
      if (!response.ok) throw new Error(payload.error || '审批失败');
      toast(decision === 'approved' ? '已批准，任务继续执行' : '已拒绝该动作', {
        variant: decision === 'approved' ? 'success' : 'info',
      });
      setTimeout(() => void refresh(), 700);
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setDeciding(null);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/${data.task.id}/cancel`, { method: 'POST' });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || '取消失败');
      toast('任务已取消');
      await refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/${data.task.id}/retry`, { method: 'POST' });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || '重试失败');
      toast('任务已重新排队');
      await refresh();
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const pending = data.approvals.filter((approval) => approval.status === 'pending');
  const assistant = [...data.messages].reverse().find((message) => message.role === 'assistant');
  const toolParts = (assistant?.parts || []).filter(
    (part): part is Extract<ChatPart, { type: 'tool' }> => part.type === 'tool',
  );
  const textParts = (assistant?.parts || []).filter(
    (part): part is Extract<ChatPart, { type: 'text' }> => part.type === 'text',
  );
  const events = [...data.events].reverse();
  const isActive = ACTIVE_STATUS.includes(data.task.status);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-[1180px] px-6 py-7 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              href="/tasks"
              className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-faint transition hover:text-ink"
            >
              <ArrowLeft size={15} />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-[21px] font-semibold tracking-[-0.02em] text-ink">
                  {data.task.title}
                </h1>
                <StatusBadge status={data.task.status} />
                {data.task.schedule.enabled ? (
                  <Badge variant="accent">
                    <CalendarClock size={9} /> 定时
                  </Badge>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                {data.expert ? (
                  <span className="inline-flex items-center gap-1.5">
                    <ExpertAvatar icon={data.expert.icon} accent={data.expert.accent} size={16} />
                    {data.expert.name}
                  </span>
                ) : null}
                <span>· {data.task.runCount} 次运行</span>
                <span>· 创建于 {relativeTime(data.task.createdAt)}</span>
                {data.task.nextRunAt ? <span>· 下次 {relativeTime(data.task.nextRunAt)}</span> : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isActive ? (
              <Button variant="secondary" loading={busy} onClick={cancel}>
                <Square size={12} /> 取消
              </Button>
            ) : (
              <Button variant="secondary" loading={busy} onClick={retry}>
                <RefreshCw size={12} /> 重新执行
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <Progress
            value={data.task.progress}
            tone={
              data.task.status === 'completed'
                ? 'success'
                : data.task.status === 'failed'
                  ? 'danger'
                  : data.task.status === 'waiting_approval'
                    ? 'warning'
                    : 'accent'
            }
          />
          <span className="shrink-0 text-[11px] text-faint">{data.task.progress}%</span>
          {isActive ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-cyan">
              <Loader2 size={11} className="animate-spin" /> 实时
            </span>
          ) : null}
        </div>

        {pending.length ? (
          <div className="mt-5 overflow-hidden rounded-xl border border-warning/30 bg-warning/[0.06]">
            <div className="flex items-center gap-2 border-b border-warning/20 px-4 py-2.5">
              <ShieldAlert size={14} className="text-warning" />
              <p className="text-[12.5px] font-medium text-warning">
                任务已暂停，等待 {pending.length} 项人工审批
              </p>
            </div>
            <div className="divide-y divide-warning/10">
              {pending.map((approval) => (
                <div key={approval.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[11px] text-warning/90">{approval.toolName}</span>
                    <span className="text-[11px] text-muted">{approval.risk}</span>
                  </div>
                  <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-black/30 p-2.5 font-mono text-[10.5px] leading-relaxed text-muted">
                    {JSON.stringify(approval.toolArgs, null, 2)}
                  </pre>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      loading={deciding === approval.id}
                      onClick={() => decide(approval.id, 'approved')}
                    >
                      <Check size={12} /> 批准执行
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => decide(approval.id, 'denied')}>
                      <X size={12} /> 拒绝
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {data.task.error ? (
          <div className="mt-4">
            <ErrorBox message={data.task.error} />
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-medium text-ink">任务目标</p>
                <span className="text-[10.5px] text-faint">创建者提供</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                {data.task.goal}
              </p>
            </Card>

            {toolParts.length ? (
              <div>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
                  工具轨迹
                </p>
                <div className="space-y-1.5">
                  {toolParts.map((part) => (
                    <ToolCard key={part.id} part={part} />
                  ))}
                </div>
              </div>
            ) : null}

            <Card className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-medium text-ink">执行结果</p>
                {assistant?.status === 'streaming' ? (
                  <span className="inline-flex items-center gap-1.5 text-[10.5px] text-cyan">
                    <Spinner size={10} /> 生成中
                  </span>
                ) : null}
              </div>
              {textParts.length ? (
                <div className="mt-3">
                  <Markdown>{textParts.map((part) => part.text).join('')}</Markdown>
                </div>
              ) : data.task.resultSummary ? (
                <p className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">
                  {data.task.resultSummary}
                </p>
              ) : isActive ? (
                <p className="mt-3 text-[12px] text-faint">专家正在执行，结果将实时写入这里。</p>
              ) : (
                <p className="mt-3 text-[12px] text-faint">暂无结果。</p>
              )}

              {data.artifacts.length ? (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 text-[11px] text-faint">交付物 · {data.artifacts.length}</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {data.artifacts.map((artifact) => (
                      <button
                        key={artifact.id}
                        type="button"
                        onClick={() => setPreview(artifact)}
                        className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2 text-left transition hover:border-accent/30"
                      >
                        <FileText size={14} className="shrink-0 text-accent-2" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[11.5px] text-ink">{artifact.name}</span>
                          <span className="text-[10px] text-faint">{bytes(artifact.size)}</span>
                        </span>
                        <Download size={12} className="shrink-0 text-faint" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-medium text-ink">执行计划</p>
                <span className="text-[10.5px] text-faint">
                  {data.steps.filter((step) => step.status === 'done').length}/{data.steps.length}
                </span>
              </div>
              {data.steps.length === 0 ? (
                <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
                  {isActive ? '专家正在生成计划…' : '该任务未生成计划。'}
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  {data.steps.map((step) => (
                    <div key={step.id} className="flex gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                        {step.status === 'done' ? (
                          <CheckCircle2 size={14} className="text-success" />
                        ) : step.status === 'running' ? (
                          <Loader2 size={13} className="animate-spin text-cyan" />
                        ) : step.status === 'failed' ? (
                          <XCircle size={13} className="text-danger" />
                        ) : (
                          <CircleDashed size={13} className="text-faint" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p
                          className={cn(
                            'text-[11.5px] font-medium',
                            step.status === 'done' ? 'text-muted' : 'text-ink',
                          )}
                        >
                          {step.ordinal + 1}. {step.title}
                        </p>
                        {step.detail ? (
                          <p className="mt-0.5 text-[10.5px] leading-relaxed text-faint">
                            {step.detail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-[12.5px] font-medium text-ink">运行事件</p>
                <span className="text-[10.5px] text-faint">{data.events.length}</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
                {events.length === 0 ? (
                  <p className="px-4 py-6 text-[11px] text-faint">暂无事件。</p>
                ) : (
                  <div className="divide-y divide-line/60">
                    {events.slice(0, 60).map((event) => (
                      <div key={event.id} className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-accent/60" />
                          <p className="text-[11px] text-muted">
                            {EVENT_LABEL[event.type] || event.type}
                          </p>
                          <span className="ml-auto text-[9.5px] text-faint">
                            {relativeTime(event.createdAt)}
                          </span>
                        </div>
                        {event.payload && Object.keys(event.payload).length ? (
                          <p className="mt-0.5 truncate pl-3 font-mono text-[9.5px] text-faint">
                            {JSON.stringify(event.payload).slice(0, 140)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <p className="text-[12.5px] font-medium text-ink">运行信息</p>
              <div className="mt-3 space-y-2 text-[11px]">
                <Row label="状态" value={statusLabel(data.task.status)} />
                <Row label="最近运行" value={data.task.lastRunAt ? relativeTime(data.task.lastRunAt) : '—'} />
                <Row label="完成时间" value={data.task.finishedAt ? relativeTime(data.task.finishedAt) : '—'} />
                <Row
                  label="定时计划"
                  value={data.task.schedule.enabled ? data.task.schedule.cron || '已启用' : '未启用'}
                />
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.name || '交付物'}
        size="xl"
      >
        {preview ? (
          <div className="h-[70vh] overflow-hidden rounded-xl border border-line">
            <ArtifactPanel
              artifact={preview}
              artifacts={data.artifacts}
              onSelect={(id) => setPreview(data.artifacts.find((item) => item.id === id) || null)}
              onClose={() => setPreview(null)}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'completed'
      ? 'success'
      : status === 'failed'
        ? 'danger'
        : status === 'waiting_approval'
          ? 'warning'
          : status === 'running' || status === 'planning'
            ? 'cyan'
            : 'accent';
  return (
    <Badge variant={variant} dot>
      {statusLabel(status)}
    </Badge>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-faint">{label}</span>
      <span className="truncate text-muted">{value}</span>
    </div>
  );
}
