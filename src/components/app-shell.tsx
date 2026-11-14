'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BookOpen,
  ChevronsUpDown,
  Command,
  LayoutGrid,
  ListChecks,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Plug,
  Search,
  Settings,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { Logo } from '@/components/brand';
import { Badge, Button } from '@/components/ui';
import { cn, relativeTime } from '@/lib/utils';
import { useToast } from '@/components/toast';
import { ThemeToggle } from '@/components/theme-toggle';
import { ThreadManager } from '@/components/thread-manager';

type RecentThread = { id: string; title: string; lastMessageAt: string };

type ShellUser = {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  avatarColor: string;
  orgName: string;
  orgPlan: string;
};

const NAV = [
  { href: '/chat', label: '对话', icon: MessageSquare, desc: '与专家协作' },
  { href: '/apps', label: '应用', icon: LayoutGrid, desc: '统一超级入口' },
  { href: '/tasks', label: '任务', icon: ListChecks, desc: '异步交付' },
  { href: '/experts', label: '专家', icon: Sparkles, desc: '能力人格' },
  { href: '/skills', label: '技能', icon: Wand2, desc: '方法论与工具' },
  { href: '/connectors', label: '连接器', icon: Plug, desc: '接入企业系统' },
  { href: '/knowledge', label: '知识库', icon: BookOpen, desc: '组织资料' },
  { href: '/settings', label: '设置', icon: Settings, desc: '治理与用量' },
] as const;

const ROLE_LABEL: Record<string, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  viewer: '只读',
};

const SECTION_LABEL: Record<string, string> = {
  chat: '对话',
  apps: '应用',
  tasks: '任务',
  experts: '专家',
  skills: '技能',
  connectors: '连接器',
  knowledge: '知识库',
  settings: '设置',
};

export function AppShell({
  user,
  recent,
  demoMode,
  children,
}: {
  user: ShellUser;
  recent: RecentThread[];
  demoMode: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [threadManagerOpen, setThreadManagerOpen] = React.useState(false);

  const section = pathname.split('/')[1] || 'chat';

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  React.useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch {
      toast('退出失败，请重试', { variant: 'error' });
    }
  };

  const sidebar = (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden">
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <Logo size={28} />
        <div className="flex items-baseline gap-1.5">
          <span className="text-[15.5px] font-semibold tracking-tight text-ink">Cuter</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
            Workbench
          </span>
        </div>
        <button
          className="ml-auto rounded-md p-1 text-faint transition hover:bg-surface-3 hover:text-ink lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="关闭菜单"
        >
          <X size={16} />
        </button>
      </div>

      <div className="px-3 pb-1">
        <Link href="/chat" className="block">
          <Button variant="primary" className="w-full justify-start gap-2">
            <Plus size={15} strokeWidth={2.4} />
            新建对话
          </Button>
        </Link>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Link href="/tasks">
            <Button variant="ghost" size="sm" className="w-full justify-start text-[11.5px]">
              <Activity size={13} />
              新建任务
            </Button>
          </Link>
          <Link href="/experts">
            <Button variant="ghost" size="sm" className="w-full justify-start text-[11.5px]">
              <Sparkles size={13} />
              找专家
            </Button>
          </Link>
        </div>
      </div>

      <nav className="mt-3 space-y-0.5 px-3">
        {NAV.map((item) => {
          const isActive =
            item.href === '/chat'
              ? pathname.startsWith('/chat')
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] transition-colors',
                isActive
                  ? 'bg-surface-3 text-ink'
                  : 'text-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              {isActive ? (
                <span className="absolute left-0 top-1/2 h-4 w-[2px] -translate-y-1/2 rounded-full bg-gradient-to-b from-accent to-cyan" />
              ) : null}
              <Icon
                size={16}
                strokeWidth={1.8}
                className={cn('shrink-0', isActive ? 'text-accent-2' : 'text-faint')}
              />
              <span className="flex-1">{item.label}</span>
              {item.href === '/settings' && (user.role === 'owner' || user.role === 'admin') ? (
                <span className="h-1.5 w-1.5 rounded-full bg-success/70" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 flex min-h-0 flex-1 flex-col px-3">
        <div className="flex items-center justify-between px-2.5 pb-2">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-faint">
            最近对话
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[10.5px] text-faint">{recent.length}</span>
            <button
              type="button"
              onClick={() => setThreadManagerOpen(true)}
              className="rounded-md p-1 text-faint transition hover:bg-surface-3 hover:text-ink"
              title="管理会话：批量归档或删除"
              aria-label="管理会话"
            >
              <MoreHorizontal size={13} />
            </button>
          </div>
        </div>
        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-2">
          {recent.length === 0 ? (
            <p className="px-2.5 py-3 text-[11.5px] leading-relaxed text-faint">
              还没有对话。新建一个，让 Cuter 开始工作。
            </p>
          ) : (
            <div className="space-y-0.5">
              {recent.map((thread) => {
                const active = pathname === `/chat/${thread.id}`;
                return (
                  <Link
                    key={thread.id}
                    href={`/chat/${thread.id}`}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12px] transition-colors',
                      active
                        ? 'bg-surface-3 text-ink'
                        : 'text-muted hover:bg-surface-2 hover:text-ink',
                    )}
                  >
                    <MessageSquare size={13} className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate">{thread.title}</span>
                    <span className="shrink-0 text-[10px] text-faint">
                      {relativeTime(thread.lastMessageAt)}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto shrink-0 border-t border-line/70 p-3">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="mb-2 flex w-full items-center gap-2 rounded-lg border border-line bg-surface-2/50 px-2.5 py-2 text-[11.5px] text-faint transition hover:border-line-strong hover:text-muted"
        >
          <Search size={13} />
          <span className="flex-1 text-left">搜索或跳转</span>
          <span className="flex items-center gap-0.5 rounded border border-line px-1 py-0.5 text-[10px]">
            <Command size={9} />K
          </span>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-surface-3"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-white/90"
              style={{
                background: `linear-gradient(145deg, ${user.avatarColor}, ${user.avatarColor}88)`,
              }}
            >
              {user.name.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-ink">{user.name}</span>
              <span className="block truncate text-[10.5px] text-faint">{user.orgName}</span>
            </span>
            <ChevronsUpDown size={13} className="text-faint" />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute bottom-full left-0 z-50 mb-2 w-full animate-fade-up overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
                <div className="px-2.5 py-2">
                  <p className="truncate text-[12px] font-medium text-ink">{user.email}</p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {ROLE_LABEL[user.role]} ·{' '}
                    {user.orgPlan === 'enterprise' ? '企业版' : user.orgPlan}
                  </p>
                </div>
                <div className="my-1 h-px bg-line/70" />
                <Link
                  href="/settings"
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-muted transition hover:bg-surface-3 hover:text-ink"
                >
                  <Settings size={13} />
                  组织设置
                </Link>
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <LogOut size={13} />
                  退出登录
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-[258px] shrink-0 overflow-hidden border-r border-line/70 bg-surface/85 lg:flex">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-full w-[280px] animate-slide-in overflow-hidden border-r border-line bg-surface">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-13 shrink-0 items-center justify-between border-b border-line/60 px-4 glass lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-1.5 text-muted transition hover:bg-surface-3 hover:text-ink lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="打开菜单"
            >
              <PanelLeft size={18} />
            </button>
            <div className="flex items-center gap-1.5 text-[12.5px]">
              <span className="text-faint">Cuter</span>
              <span className="text-faint/60">/</span>
              <span className="font-medium text-ink">{SECTION_LABEL[section] || '工作台'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {demoMode ? (
              <Link href="/settings?tab=providers">
                <Badge variant="warning" dot className="hidden sm:inline-flex">
                  演示模型
                </Badge>
              </Link>
            ) : (
              <Badge variant="success" dot className="hidden sm:inline-flex">
                模型已配置
              </Badge>
            )}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="hidden h-8 items-center gap-2 rounded-lg border border-line bg-surface-2/40 px-2.5 text-[11.5px] text-faint transition hover:border-line-strong hover:text-muted sm:flex"
            >
              <Search size={13} />
              搜索
              <span className="ml-3 flex items-center gap-0.5 rounded border border-line px-1 py-0.5 text-[10px]">
                <Command size={9} />K
              </span>
            </button>
            <ThemeToggle />
            <Link
              href="/settings"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white/90"
              style={{
                background: `linear-gradient(145deg, ${user.avatarColor}, ${user.avatarColor}88)`,
              }}
            >
              {user.name.slice(0, 1)}
            </Link>
          </div>
        </header>

        <main className="min-h-0 flex-1">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ThreadManager open={threadManagerOpen} onClose={() => setThreadManagerOpen(false)} />
    </div>
  );
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [threads, setThreads] = React.useState<RecentThread[]>([]);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 40);
    fetch('/api/threads?archived=0&limit=40')
      .then((res) => res.json())
      .then((data) => setThreads(data.threads || []))
      .catch(() => undefined);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActive((prev) => prev + 1);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActive((prev) => Math.max(0, prev - 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const navItems = NAV.filter(
    (item) => !q || item.label.includes(q) || item.desc.includes(q) || item.href.includes(q),
  ).map((item) => ({
    key: `nav-${item.href}`,
    label: item.label,
    hint: item.desc,
    icon: item.icon as LucideIcon,
    run: () => router.push(item.href),
  }));

  const threadItems = threads
    .filter((thread) => !q || thread.title.toLowerCase().includes(q))
    .slice(0, 8)
    .map((thread) => ({
      key: `thread-${thread.id}`,
      label: thread.title,
      hint: relativeTime(thread.lastMessageAt),
      icon: MessageSquare as LucideIcon,
      run: () => router.push(`/chat/${thread.id}`),
    }));

  const actions = [
    {
      key: 'new-chat',
      label: '新建对话',
      hint: '开始一个新会话',
      icon: Plus as LucideIcon,
      run: () => router.push('/chat'),
    },
    {
      key: 'new-task',
      label: '任务中心',
      hint: '查看异步任务',
      icon: ListChecks as LucideIcon,
      run: () => router.push('/tasks'),
    },
  ].filter((action) => !q || action.label.includes(q) || action.hint.includes(q));

  const all = [...actions, ...navItems, ...threadItems];
  const selected = all[Math.min(active, Math.max(0, all.length - 1))];

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
      <div
        className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-[6px]"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-xl animate-fade-up overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_40px_120px_-20px_rgba(0,0,0,0.95)]">
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search size={16} className="text-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && selected) {
                selected.run();
                onClose();
              }
            }}
            placeholder="搜索对话，或跳转到…"
            className="h-6 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
          />
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-faint">ESC</span>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {all.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12px] text-faint">没有匹配结果</p>
          ) : (
            <>
              {actions.length ? <SectionLabel>快捷操作</SectionLabel> : null}
              {actions.map((item) => (
                <PaletteItem
                  key={item.key}
                  item={item}
                  active={selected?.key === item.key}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                />
              ))}
              {navItems.length ? <SectionLabel>前往</SectionLabel> : null}
              {navItems.map((item) => (
                <PaletteItem
                  key={item.key}
                  item={item}
                  active={selected?.key === item.key}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                />
              ))}
              {threadItems.length ? <SectionLabel>最近对话</SectionLabel> : null}
              {threadItems.map((item) => (
                <PaletteItem
                  key={item.key}
                  item={item}
                  active={selected?.key === item.key}
                  onClick={() => {
                    item.run();
                    onClose();
                  }}
                />
              ))}
            </>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line bg-surface-2 px-4 py-2 text-[10.5px] text-faint">
          <span className="flex items-center gap-3">
            <span>↑↓ 选择</span>
            <span>↵ 打开</span>
          </span>
          <span className="flex items-center gap-1.5">
            <LayoutGrid size={11} />
            Cuter Command
          </span>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">
      {children}
    </p>
  );
}

function PaletteItem({
  item,
  active,
  onClick,
}: {
  item: { label: string; hint?: string; icon: LucideIcon };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition',
        active ? 'bg-surface-3' : 'hover:bg-surface-3',
      )}
    >
      <Icon size={15} className={active ? 'text-accent-2' : 'text-faint'} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ink">{item.label}</span>
        {item.hint ? <span className="block truncate text-[10.5px] text-faint">{item.hint}</span> : null}
      </span>
    </button>
  );
}
