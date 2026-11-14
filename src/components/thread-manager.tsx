'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, CheckSquare, Loader2, MessageSquare, Search, Trash2 } from 'lucide-react';
import { Badge, Button, Modal } from '@/components/ui';
import { useToast } from '@/components/toast';
import { cn, relativeTime } from '@/lib/utils';

type ThreadItem = {
  id: string;
  title: string;
  lastMessageAt: string;
  archived: boolean;
};

type Tab = 'active' | 'archived';

export function ThreadManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<Tab>('active');
  const [items, setItems] = React.useState<ThreadItem[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const load = React.useCallback(async (nextTab: Tab) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(
        `/api/threads?archived=${nextTab === 'archived' ? '1' : '0'}&limit=100`,
        { cache: 'no-store' },
      );
      const data = (await response.json()) as { threads?: ThreadItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || '加载会话失败');
      setItems(data.threads || []);
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setQuery('');
    setTab('active');
    void load('active');
  }, [open, load]);

  const switchTab = (next: Tab) => {
    setTab(next);
    setConfirmDelete(false);
    void load(next);
  };

  const visible = items.filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase()));
  const currentThreadId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;
  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.id));

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const item of visible) next.delete(item.id);
      } else {
        for (const item of visible) next.add(item.id);
      }
      return next;
    });
  };

  const runAction = async (action: 'archive' | 'unarchive' | 'delete') => {
    if (!selected.size) return;
    if (action === 'delete' && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setError('');
    const ids = [...selected];
    try {
      const response = await fetch('/api/threads/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, action }),
      });
      const data = (await response.json()) as { affected?: number; error?: string };
      if (!response.ok) throw new Error(data.error || '操作失败');
      const labels = { archive: '归档', unarchive: '恢复', delete: '删除' };
      toast(`已${labels[action]} ${data.affected || ids.length} 个会话`);
      setSelected(new Set());
      setConfirmDelete(false);
      if (currentThreadId && ids.includes(currentThreadId)) {
        router.push('/chat');
      }
      await load(tab);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="管理会话"
      description="批量归档、恢复或删除左侧会话；删除后消息、交付物与运行记录会一并清理。"
      size="lg"
      footer={
        confirmDelete ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] text-danger">
              确认删除选中的 {selected.size} 个会话？此操作不可撤销。
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                取消
              </Button>
              <Button variant="danger" loading={busy} onClick={() => void runAction('delete')}>
                确认删除
              </Button>
            </div>
          </div>
        ) : (
          <>
            <span className="mr-auto text-[11px] text-faint">
              已选 {selected.size} 个
            </span>
            <Button variant="ghost" onClick={onClose}>
              关闭
            </Button>
            {tab === 'active' ? (
              <Button
                variant="secondary"
                disabled={!selected.size || busy}
                onClick={() => void runAction('archive')}
              >
                <Archive size={13} />
                归档
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={!selected.size || busy}
                onClick={() => void runAction('unarchive')}
              >
                <ArchiveRestore size={13} />
                恢复
              </Button>
            )}
            <Button
              variant="danger"
              disabled={!selected.size || busy}
              onClick={() => void runAction('delete')}
            >
              <Trash2 size={13} />
              删除
            </Button>
          </>
        )
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1">
          <button
            type="button"
            onClick={() => switchTab('active')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-[12px] transition',
              tab === 'active' ? 'bg-surface text-ink shadow-sm' : 'text-faint hover:text-muted',
            )}
          >
            进行中
          </button>
          <button
            type="button"
            onClick={() => switchTab('archived')}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-[12px] transition',
              tab === 'archived' ? 'bg-surface text-ink shadow-sm' : 'text-faint hover:text-muted',
            )}
          >
            已归档
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索会话标题…"
              className="h-8 w-full rounded-lg border border-line bg-surface-2 pl-8 pr-3 text-[12px] text-ink outline-none placeholder:text-faint focus:border-accent/40"
            />
          </div>
          <button
            type="button"
            onClick={toggleAll}
            disabled={!visible.length}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[11px] text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            <CheckSquare size={12} />
            {allVisibleSelected ? '取消全选' : '全选'}
          </button>
          <Badge variant="outline">{visible.length} 个</Badge>
        </div>

        {error ? (
          <p className="rounded-lg border border-danger/30 bg-danger/[0.04] px-3 py-2 text-[11.5px] text-danger">
            {error}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[12px] text-faint">
            <Loader2 size={14} className="animate-spin" /> 加载会话…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-faint">
            <MessageSquare size={18} />
            <p className="text-[12px]">{tab === 'archived' ? '没有已归档会话' : '没有匹配的会话'}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {visible.map((item) => {
              const checked = selected.has(item.id);
              const current = item.id === currentThreadId;
              return (
                <label
                  key={item.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition',
                    checked
                      ? 'border-accent/40 bg-accent/[0.06]'
                      : 'border-line/60 bg-surface-2/40 hover:border-line-strong',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item.id)}
                    className="h-3.5 w-3.5 shrink-0 accent-[#7c6cff]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[12.5px] font-medium text-ink">{item.title}</span>
                      {current ? <Badge variant="outline" className="shrink-0 scale-90">当前</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] text-faint">
                      {relativeTime(item.lastMessageAt)} · {item.archived ? '已归档' : '进行中'}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
