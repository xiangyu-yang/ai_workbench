'use client';

import * as React from 'react';
import { Activity, BarChart3, Coins, Cpu, Timer } from 'lucide-react';
import { Badge, Card, EmptyState, Progress, Spinner } from '@/components/ui';
import { formatNumber, formatUsd } from '@/lib/utils';

type UsageData = {
  range: { from: string; to: string };
  totals: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    runCount: number;
    avgLatencyMs: number;
  };
  month: { tokens: number; quota: number };
  daily: Array<{
    day: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    runs: number;
  }>;
  models: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    runs: number;
  }>;
};

export function UsagePanel({ quota }: { quota: number }) {
  const [data, setData] = React.useState<UsageData | null>(null);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    fetch('/api/usage')
      .then(async (response) => {
        const payload = (await response.json()) as UsageData & { error?: string };
        if (!response.ok) throw new Error(payload.error || '加载失败');
        setData(payload);
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  if (error) {
    return <Card className="p-5 text-[12px] text-danger">{error}</Card>;
  }
  if (!data) {
    return (
      <Card className="flex items-center justify-center gap-2 p-12 text-[12px] text-faint">
        <Spinner size={14} /> 加载用量数据…
      </Card>
    );
  }

  const maxDaily = Math.max(
    1,
    ...data.daily.map((item) => item.inputTokens + item.outputTokens),
  );
  const recentDays = data.daily.slice(-21);
  const quotaPercent = data.month.quota
    ? Math.min(100, (data.month.tokens / data.month.quota) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: '总 Token',
            value: formatNumber(data.totals.inputTokens + data.totals.outputTokens),
            icon: Coins,
            hint: `输入 ${formatNumber(data.totals.inputTokens)} / 输出 ${formatNumber(data.totals.outputTokens)}`,
          },
          {
            label: '预估成本',
            value: formatUsd(data.totals.costUsd),
            icon: BarChart3,
            hint: '按模型单价估算',
          },
          {
            label: '运行次数',
            value: formatNumber(data.totals.runCount),
            icon: Activity,
            hint: '近 30 天',
          },
          {
            label: '平均延迟',
            value: `${(data.totals.avgLatencyMs / 1000).toFixed(1)}s`,
            icon: Timer,
            hint: '成功运行的首尾耗时',
          },
        ].map((item) => (
          <Card key={item.label} className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] text-faint">{item.label}</p>
              <item.icon size={14} className="text-faint" />
            </div>
            <p className="mt-2 text-[20px] font-semibold tracking-tight text-ink">{item.value}</p>
            <p className="mt-0.5 text-[9.5px] text-faint">{item.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-medium text-ink">本月配额</h2>
            <p className="mt-0.5 text-[11px] text-faint">
              已用 {formatNumber(data.month.tokens)} / {formatNumber(data.month.quota)} tokens
            </p>
          </div>
          <Badge variant={quotaPercent > 90 ? 'danger' : quotaPercent > 70 ? 'warning' : 'success'}>
            {quotaPercent.toFixed(1)}%
          </Badge>
        </div>
        <Progress
          className="mt-3"
          value={quotaPercent}
          tone={quotaPercent > 90 ? 'danger' : quotaPercent > 70 ? 'warning' : 'accent'}
        />
        <p className="mt-2 text-[10.5px] text-faint">
          配额为本组织所有成员共享；在「组织」设置中调整。超额请求会被拒绝（HTTP 402）。
        </p>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[13px] font-medium text-ink">每日 Token</h2>
          <span className="text-[10.5px] text-faint">
            {data.range.from} → {data.range.to}
          </span>
        </div>
        {recentDays.length === 0 ? (
          <EmptyState
            className="mt-4 border-0 py-10"
            icon={<BarChart3 size={16} />}
            title="暂无用量"
            description="开始一次对话或任务后，这里会显示 token 与成本趋势。"
          />
        ) : (
          <div className="mt-5 flex h-[160px] items-end gap-1.5">
            {recentDays.map((item) => {
              const total = item.inputTokens + item.outputTokens;
              const height = Math.max(4, Math.round((total / maxDaily) * 130));
              return (
                <div key={item.day} className="group relative flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-[3px] bg-[linear-gradient(180deg,#7c6cff,#22d3ee)] opacity-70 transition group-hover:opacity-100"
                      style={{ height: `${height}px` }}
                    />
                  </div>
                  <span className="text-[8px] text-faint">{item.day.slice(5)}</span>
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max rounded-md border border-line bg-surface px-2 py-1 text-[9.5px] text-muted shadow-xl group-hover:block">
                    {item.day} · {formatNumber(total)} tokens · {formatUsd(item.costUsd)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-medium text-ink">按模型</h2>
        </div>
        {data.models.length === 0 ? (
          <p className="px-4 py-8 text-[11.5px] text-faint">暂无模型用量。</p>
        ) : (
          <div className="divide-y divide-line/70">
            {data.models.map((model) => (
              <div key={model.model} className="flex items-center gap-3 px-4 py-3">
                <Cpu size={13} className="shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[11.5px] text-ink">{model.model || '未命名模型'}</p>
                  <p className="text-[10px] text-faint">
                    输入 {formatNumber(model.inputTokens)} · 输出 {formatNumber(model.outputTokens)}
                  </p>
                </div>
                <span className="text-[10.5px] text-faint">{model.runs} 次</span>
                <span className="w-[64px] text-right text-[10.5px] text-muted">
                  {formatUsd(model.costUsd)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <p className="text-[10.5px] leading-relaxed text-faint">
        配额限制为 {formatNumber(quota)} tokens/月。成本按供应商配置的单价估算，实际以账单为准。
      </p>
    </div>
  );
}
