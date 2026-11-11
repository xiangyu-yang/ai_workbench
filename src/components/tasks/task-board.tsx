'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  ListChecks,
  Plus,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Progress,
  Select,
  Switch,
  Tabs,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { formatNumber, relativeTime, statusLabel } from '@/lib/utils';

type TaskRow = {
  id: string;
  title: string;
  goal: string;
  status: string;
  progress: number;
  expertId: string | null;
  expertName: string;
  schedule: { enabled: boolean; cron?: string; nextRunAt?: string | null };
  nextRunAt: string | null;
  lastRunAt: string | null;
  runCount: number;
  error: string;
  resultSummary: string;
  createdAt: string;
  finishedAt: string | null;
};

type Expert = { id: string; name: string; icon: string; accent: string };

const CRON_PRESETS = [
  { id: '', label: '不定时（立即执行一次）' },
  { id: '0 * * * *', label: '每小时整点' },
  { id: '0 9 * * *', label: '每天 09:00' },
  { id: '0 9 * * 1-5', label: '工作日 09:00' },
  { id: '0 9 * * 1', label: '每周一 09:00' },
  { id: '0 9 1 * *', label: '每月 1 日 09:00' },
];

function statusVariant(status: string): 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'cyan' {
  if (status === 'completed') return 'success';
  if (status === 'waiting_approval') return 'warning';
  if (status === 'failed') return 'danger';
  if (status === 'running' || status === 'planning') return 'cyan';
  if (status === 'queued') return 'accent';
  return 'default';
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={13} className="text-success" />;
  if (status === 'failed') return <XCircle size={13} className="text-danger" />;
  if (status === 'waiting_approval') return <ShieldAlert size={13} className="text-warning" />;
  if (status === 'running' || status === 'planning')
    return <Activity size={13} className="animate-pulse text-cyan" />;
  if (status === 'cancelled') return <CircleDashed size={13} className="text-faint" />;
  return <Clock3 size={13} className="text-accent-2" />;
}

export function TaskBoard({
  tasks,
  experts,
  canManage,
}: {
  tasks: TaskRow[];
  experts: Expert[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<'all' | 'active' | 'approval' | 'done' | 'failed'>('all');
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [scheduled, setScheduled] = React.useState(false);
  const [form, setForm] = React.useState({
    title: '',
    goal: '',
    expertId: experts[0]?.id || '',
    cron: '0 9 * * *',
  });

  const counts = {
    all: tasks.length,
    active: tasks.filter((task) => ['queued', 'planning', 'running'].includes(task.status)).length,
    approval: tasks.filter((task) => task.status === 'waiting_approval').length,
    done: tasks.filter((task) => task.status === 'completed').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  };

  const filtered = tasks.filter((task) => {
    if (tab === 'all') return true;
    if (tab === 'active') return ['queued', 'planning', 'running'].includes(task.status);
    if (tab === 'approval') return task.status === 'waiting_approval';
    if (tab === 'done') return task.status === 'completed';
    return task.status === 'failed';
  });

  const create = async () => {
    if (!form.title.trim()) {
      toast('请填写任务标题', { variant: 'error' });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          goal: form.goal || form.title,
          expertId: form.expertId || undefined,
          schedule: scheduled
            ? {
                enabled: true,
                cron: form.cron,
                tzOffsetMinutes: -new Date().getTimezoneOffset(),
              }
            : { enabled: false },
        }),
      });
      const data = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) throw new Error(data.error || '创建失败');
      toast(scheduled ? '定时任务已创建，将按计划执行' : '任务已创建，开始执行', {
        variant: 'success',
      });
      setOpen(false);
      setForm({ title: '', goal: '', expertId: experts[0]?.id || '', cron: '0 9 * * *' });
      setScheduled(false);
      router.push(`/tasks/${data.id}`);
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-[1240px] px-6 py-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
              <ListChecks size={12} className="text-accent-2" />
              Tasks
            </div>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">任务</h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
              把复杂目标交给后台执行：自动拆解计划、逐步推进、在关键动作前等待审批，最终交付可验收的成果。
            </p>
          </div>
          {canManage ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus size={14} /> 新建任务
            </Button>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '执行中', value: counts.active, icon: Activity, tone: 'text-cyan' },
            { label: '待审批', value: counts.approval, icon: ShieldAlert, tone: 'text-warning' },
            { label: '已完成', value: counts.done, icon: CheckCircle2, tone: 'text-success' },
            { label: '失败', value: counts.failed, icon: XCircle, tone: 'text-danger' },
          ].map((item) => (
            <div key={item.label} className="panel flex items-center gap-3 px-4 py-3">
              <item.icon size={15} className={item.tone} />
              <div>
                <p className="text-[17px] font-semibold tracking-tight text-ink">{item.value}</p>
                <p className="text-[10.5px] text-faint">{item.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: '全部', count: counts.all },
              { id: 'active', label: '进行中', count: counts.active },
              { id: 'approval', label: '待审批', count: counts.approval },
              { id: 'done', label: '已完成', count: counts.done },
              { id: 'failed', label: '失败', count: counts.failed },
            ]}
          />
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => router.refresh()}
          >
            <RefreshCw size={12} /> 刷新
          </Button>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon={<ListChecks size={18} />}
            title="暂无任务"
            description="创建一个任务，让专家在后台自主执行；或从对话中把目标一键转为任务。"
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setOpen(true)}>
                  <Plus size={14} /> 新建任务
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-4 space-y-2">
            {filtered.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => router.push(`/tasks/${task.id}`)}
                className="group flex w-full items-center gap-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left transition hover:border-line-strong hover:bg-surface-2"
              >
                <StatusIcon status={task.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
                    {task.schedule.enabled ? (
                      <Badge variant="accent" className="shrink-0 scale-90">
                        <CalendarClock size={9} /> 定时
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[10.5px] text-faint">
                    {task.expertName} · {task.runCount} 次运行 · 创建于 {relativeTime(task.createdAt)}
                    {task.nextRunAt ? ` · 下次 ${relativeTime(task.nextRunAt)}` : ''}
                  </p>
                </div>
                <div className="hidden w-[150px] shrink-0 sm:block">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-faint">
                    <span>{statusLabel(task.status)}</span>
                    <span>{task.progress}%</span>
                  </div>
                  <Progress
                    value={task.progress}
                    tone={
                      task.status === 'completed'
                        ? 'success'
                        : task.status === 'failed'
                          ? 'danger'
                          : task.status === 'waiting_approval'
                            ? 'warning'
                            : 'accent'
                    }
                  />
                </div>
                <Badge variant={statusVariant(task.status)} className="hidden shrink-0 sm:inline-flex">
                  {statusLabel(task.status)}
                </Badge>
                <ArrowUpRight
                  size={14}
                  className="shrink-0 text-faint opacity-0 transition group-hover:opacity-100"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="新建任务"
        description="描述目标与验收标准。执行模式会自动规划步骤、调用能力并交付成果。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={creating} onClick={create}>
              创建任务
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="任务标题" required>
            <Input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="例如：每周竞品动态简报"
            />
          </Field>
          <Field label="目标与验收标准" hint="越具体，执行质量越高">
            <Textarea
              rows={6}
              value={form.goal}
              onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
              placeholder="说明背景、需要产出的材料、格式要求与截止时间…"
            />
          </Field>
          <Field label="执行专家">
            <Select
              value={form.expertId}
              onChange={(event) => setForm((prev) => ({ ...prev, expertId: event.target.value }))}
            >
              {experts.map((expert) => (
                <option key={expert.id} value={expert.id}>
                  {expert.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <div>
              <p className="text-[12px] font-medium text-ink">定时执行</p>
              <p className="text-[10.5px] text-faint">创建后会立即运行一次，此后按计划重复</p>
            </div>
            <Switch checked={scheduled} onChange={setScheduled} label="定时执行" />
          </div>
          {scheduled ? (
            <div className="space-y-2">
              <Field label="执行计划">
                <Select
                  value={form.cron}
                  onChange={(event) => setForm((prev) => ({ ...prev, cron: event.target.value }))}
                >
                  {CRON_PRESETS.filter((preset) => preset.id).map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="cron 表达式" hint="5 段标准格式；按你所在时区换算">
                <Input
                  value={form.cron}
                  onChange={(event) => setForm((prev) => ({ ...prev, cron: event.target.value }))}
                  className="font-mono text-[12px]"
                />
              </Field>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
