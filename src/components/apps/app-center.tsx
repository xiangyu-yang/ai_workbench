'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Bot,
  ExternalLink,
  Grid2X2,
  Link2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Switch,
  Textarea,
} from '@/components/ui';
import { expertIcon } from '@/components/brand';
import { useToast } from '@/components/toast';
import { cn, relativeTime } from '@/lib/utils';

type AppRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  accent: string;
  type: 'internal' | 'external';
  url: string;
  expertId: string | null;
  expertName: string | null;
  enabled: boolean;
  sortOrder: number;
  lastOpenedAt: string | null;
};

type ExpertOption = { id: string; name: string; icon: string; accent: string };

const EMPTY_FORM = {
  name: '',
  description: '',
  category: '内部应用',
  icon: 'bot',
  accent: '#7c6cff',
  type: 'internal' as 'internal' | 'external',
  url: '',
  expertId: '',
  enabled: true,
  sortOrder: 0,
};

const ICON_OPTIONS = [
  { value: 'bot', label: '智能体' },
  { value: 'spark', label: '助手' },
  { value: 'telescope', label: '研究' },
  { value: 'file-text', label: '文档' },
  { value: 'chart', label: '数据' },
  { value: 'briefcase', label: '业务' },
  { value: 'database', label: '数据源' },
  { value: 'globe', label: '全球' },
  { value: 'code', label: '研发' },
  { value: 'layout-grid', label: '通用' },
];

export function AppCenter({
  apps,
  experts,
  canManage,
}: {
  apps: AppRow[];
  experts: ExpertOption[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState('全部');
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AppRow | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<AppRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const categories = ['全部', ...new Set(apps.map((app) => app.category))];
  const filtered = apps.filter((app) => {
    const matchCategory = category === '全部' || app.category === category;
    const text = query.trim().toLowerCase();
    const matchQuery =
      !text ||
      app.name.toLowerCase().includes(text) ||
      app.description.toLowerCase().includes(text) ||
      (app.expertName || '').toLowerCase().includes(text);
    return matchCategory && matchQuery && (app.enabled || canManage);
  });
  const recent = apps
    .filter((app) => app.enabled && app.lastOpenedAt)
    .sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || ''))
    .slice(0, 4);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setOpen(true);
  };

  const openEdit = (app: AppRow) => {
    setEditing(app);
    setForm({
      name: app.name,
      description: app.description,
      category: app.category,
      icon: app.icon,
      accent: app.accent,
      type: app.type,
      url: app.url,
      expertId: app.expertId || '',
      enabled: app.enabled,
      sortOrder: app.sortOrder,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast('请填写应用名称', { variant: 'error' });
      return;
    }
    if (form.type === 'internal' && !form.expertId) {
      toast('内部应用需要选择专家', { variant: 'error' });
      return;
    }
    if (form.type === 'external' && !/^https?:\/\//.test(form.url)) {
      toast('请填写 http(s) 地址', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(editing ? `/api/apps/${editing.id}` : '/api/apps', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          expertId: form.type === 'internal' ? form.expertId : null,
          url: form.type === 'external' ? form.url : '',
          sortOrder: Number(form.sortOrder) || 0,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast(editing ? '应用已更新' : '应用已添加', { variant: 'success' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const launch = async (app: AppRow) => {
    if (!app.enabled) return;
    if (app.type === 'external') {
      if (app.url) window.open(app.url, '_blank', 'noopener,noreferrer');
      void fetch(`/api/apps/${app.id}/open`, { method: 'POST', keepalive: true }).catch(() => undefined);
      return;
    }
    if (!app.expertId) {
      toast('该应用尚未绑定专家', { variant: 'error' });
      return;
    }
    try {
      const response = await fetch(`/api/apps/${app.id}/open`, { method: 'POST' });
      const data = (await response.json()) as { target?: string; error?: string };
      if (!response.ok) throw new Error(data.error || '打开失败');
      router.push(data.target || `/chat?expert=${app.expertId}&app=${app.id}`);
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/apps/${deleteTarget.id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '删除失败');
      toast('应用已删除');
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-[1240px] px-6 py-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
              <Grid2X2 size={12} className="text-accent-2" />
              App Center
            </div>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">应用中心</h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
              统一纳管内部专家应用与外部 AI 工具。点击图标即可进入应用，所有入口共享组织身份、权限与审计。
            </p>
          </div>
          {canManage ? (
            <Button variant="primary" onClick={openCreate}>
              <Plus size={14} /> 接入应用
            </Button>
          ) : null}
        </div>

        {recent.length ? (
          <div className="mt-7">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">最近使用</p>
              <span className="text-[10.5px] text-faint">{recent.length}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {recent.map((app) => {
                const Icon = expertIcon(app.icon);
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => void launch(app)}
                    className="group flex items-center gap-2 rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-left transition hover:-translate-y-0.5 hover:border-line-strong"
                  >
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-lg"
                      style={{ background: `${app.accent}1f`, color: app.accent }}
                    >
                      <Icon size={13} />
                    </span>
                    <span className="text-[11.5px] text-ink">{app.name}</span>
                    <ArrowUpRight size={11} className="text-faint transition group-hover:text-accent-2" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2/50 p-1">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(
                  'h-7 shrink-0 rounded-lg px-2.5 text-[11.5px] transition',
                  category === item ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full max-w-[250px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索应用或专家"
              className="h-9 pl-8"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<Grid2X2 size={18} />}
            title="还没有应用"
            description="把专家封装为内部应用，或接入外部 AI 工具，形成团队的统一入口。"
            action={
              canManage ? (
                <Button variant="primary" onClick={openCreate}>
                  <Plus size={14} /> 接入第一个应用
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((app) => {
              const Icon = expertIcon(app.icon);
              return (
                <div
                  key={app.id}
                  className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong"
                >
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-40 blur-2xl transition group-hover:opacity-70"
                    style={{ background: `radial-gradient(60% 100% at 20% 0%, ${app.accent}33, transparent)` }}
                  />
                  <div className="relative flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => void launch(app)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line"
                        style={{
                          background: `linear-gradient(145deg, ${app.accent}33, ${app.accent}0d 60%, rgba(255,255,255,0.02))`,
                          color: app.accent,
                        }}
                      >
                        <Icon size={20} strokeWidth={1.7} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[14px] font-semibold text-ink">{app.name}</span>
                          <Badge variant={app.type === 'external' ? 'outline' : 'accent'} className="shrink-0 scale-90">
                            {app.type === 'external' ? '外部' : '内部'}
                          </Badge>
                          {!app.enabled ? (
                            <Badge variant="warning" className="shrink-0 scale-90">
                              已停用
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-faint">
                          {app.type === 'external'
                            ? (() => {
                                try {
                                  return new URL(app.url).host;
                                } catch {
                                  return app.url;
                                }
                              })()
                            : `${app.expertName || '专家'} · ${app.category}`}
                        </span>
                      </span>
                    </button>
                    <span className="flex shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openEdit(app)}
                            className="rounded-md p-1 text-faint hover:bg-surface-3 hover:text-ink"
                            aria-label="编辑应用"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(app)}
                            className="rounded-md p-1 text-faint hover:bg-danger/10 hover:text-danger"
                            aria-label="删除应用"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      ) : null}
                    </span>
                  </div>
                  <p className="relative mt-3 line-clamp-2 min-h-[34px] text-[11.8px] leading-relaxed text-muted">
                    {app.description || '暂无描述'}
                  </p>
                  <div className="relative mt-3 flex items-center justify-between border-t border-line/70 pt-3">
                    <span className="inline-flex items-center gap-1 text-[10.5px] text-faint">
                      {app.type === 'external' ? <Link2 size={11} /> : <Bot size={11} />}
                      {app.type === 'external' ? '外部应用' : '内部智能体'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void launch(app)}
                      className="inline-flex items-center gap-1 text-[10.5px] text-accent-2 transition hover:text-ink"
                    >
                      进入应用 <ArrowUpRight size={11} />
                    </button>
                  </div>
                </div>
              );
            })}
            {canManage ? (
              <button
                type="button"
                onClick={openCreate}
                className="flex min-h-[166px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-faint transition hover:border-accent/30 hover:bg-accent/[0.03] hover:text-accent-2"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line">
                  <Plus size={18} />
                </span>
                <span className="text-[12px]">接入一个新应用</span>
              </button>
            ) : null}
          </div>
        )}

        <div className="mt-8 rounded-xl border border-line bg-surface-2/30 px-4 py-3 text-[11px] leading-relaxed text-faint">
          <p className="font-medium text-muted">应用接入规范</p>
          <p className="mt-1">
            内部应用绑定专家，进入后直接开始受控对话；外部应用需提供 http(s) 地址，将在新标签页打开。应用点击会写入审计与最近使用记录。
          </p>
        </div>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑应用' : '接入应用'}
        description="内部应用复用专家能力；外部应用作为统一入口跳转。"
        width="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={save}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="应用名称" required>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：深度研究"
              />
            </Field>
            <Field label="分类">
              <Input
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="研究 / 写作 / 业务"
              />
            </Field>
          </div>
          <Field label="描述">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="这个应用解决什么问题？"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="类型">
              <Select
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, type: event.target.value as 'internal' | 'external' }))
                }
              >
                <option value="internal">内部专家应用</option>
                <option value="external">外部 AI 应用</option>
              </Select>
            </Field>
            <Field label="图标">
              <Select
                value={form.icon}
                onChange={(event) => setForm((prev) => ({ ...prev, icon: event.target.value }))}
              >
                {ICON_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {form.type === 'internal' ? (
            <Field label="绑定专家" required>
              <Select
                value={form.expertId}
                onChange={(event) => setForm((prev) => ({ ...prev, expertId: event.target.value }))}
              >
                <option value="">选择专家</option>
                {experts.map((expert) => (
                  <option key={expert.id} value={expert.id}>
                    {expert.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="访问地址" required hint="仅支持 http(s)，将在新标签页打开">
              <Input
                value={form.url}
                onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="https://example.com/ai-app"
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="强调色">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.accent}
                  onChange={(event) => setForm((prev) => ({ ...prev, accent: event.target.value }))}
                  className="h-9 w-10 cursor-pointer rounded-lg border border-line bg-transparent"
                />
                <Input
                  value={form.accent}
                  onChange={(event) => setForm((prev) => ({ ...prev, accent: event.target.value }))}
                  className="font-mono"
                />
              </div>
            </Field>
            <Field label="排序">
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) }))}
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2.5">
            <div>
              <p className="text-[12px] text-ink">启用应用</p>
              <p className="text-[10.5px] text-faint">停用后不在应用中心展示，也不能被打开</p>
            </div>
            <Switch
              checked={form.enabled}
              onChange={(checked: boolean) => setForm((prev) => ({ ...prev, enabled: checked }))}
            />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/30 px-3 py-2.5">
            {form.type === 'external' ? (
              <ExternalLink size={14} className="text-cyan" />
            ) : (
              <Sparkles size={14} className="text-accent-2" />
            )}
            <span className="text-[11px] text-muted">
              {form.type === 'external' ? '外部应用点击后新开标签页' : '内部应用进入后自动绑定专家上下文'}
            </span>
          </div>
        </div>
      </Drawer>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除应用"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="danger" loading={deleting} onClick={remove}>
              删除
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-muted">
          确定删除应用 <span className="font-medium text-ink">{deleteTarget?.name}</span>？不会删除绑定的专家或历史对话。
        </p>
      </Modal>
    </div>
  );
}
