'use client';

import * as React from 'react';
import { ChevronDown, ScrollText, Search } from 'lucide-react';
import { Badge, Card, EmptyState, Input, Spinner } from '@/components/ui';
import { absoluteTime, cn } from '@/lib/utils';

type LogRow = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  ip: string;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
};

const ACTION_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'accent'> = {
  'tool.invoke': 'warning',
  'approval.approved': 'success',
  'approval.denied': 'danger',
  'auth.login': 'accent',
  'auth.register': 'accent',
  'api_key.create': 'warning',
  'api_key.revoke': 'danger',
  'member.remove': 'danger',
  'member.role': 'warning',
};

export function AuditPanel() {
  const [logs, setLogs] = React.useState<LogRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const load = React.useCallback(async (action = '') => {
    setLoading(true);
    try {
      const response = await fetch(`/api/audit?limit=120${action ? `&action=${encodeURIComponent(action)}` : ''}`);
      const data = (await response.json()) as { logs?: LogRow[]; error?: string };
      if (!response.ok) throw new Error(data.error || '加载失败');
      setLogs(data.logs || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-medium text-ink">审计日志</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            记录登录、资产变更、密钥操作、审批与危险工具调用。
          </p>
        </div>
        <div className="relative w-full max-w-[240px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void load(query.trim());
            }}
            placeholder="按 action 过滤，回车搜索"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {loading ? (
        <Card className="flex items-center justify-center gap-2 p-10 text-[11.5px] text-faint">
          <Spinner size={13} /> 加载审计日志…
        </Card>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={16} />}
          title="暂无审计记录"
          description="组织内的关键操作会自动写入这里，用于安全审查与追责。"
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line/70">
            {logs.map((log) => (
              <div key={log.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-2"
                >
                  <Badge variant={ACTION_TONE[log.action] || 'default'} className="shrink-0 font-mono">
                    {log.action}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
                    {log.actorName || '系统'} · {log.targetType || '—'}
                    {log.targetId ? ` · ${log.targetId.slice(0, 18)}` : ''}
                  </span>
                  <span className="hidden shrink-0 text-[10px] text-faint sm:block">
                    {log.ip || '—'}
                  </span>
                  <span className="shrink-0 text-[10px] text-faint">{absoluteTime(log.createdAt)}</span>
                  <ChevronDown
                    size={12}
                    className={cn('shrink-0 text-faint transition', expanded === log.id && 'rotate-180')}
                  />
                </button>
                {expanded === log.id ? (
                  <div className="border-t border-line/60 bg-black/20 px-4 py-2.5">
                    <p className="text-[10px] text-faint">
                      {log.actorEmail || '—'} · 目标 {log.targetId || '—'}
                    </p>
                    <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
