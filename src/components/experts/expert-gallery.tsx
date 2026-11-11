'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  BookOpen,
  MessageSquare,
  Plug,
  Plus,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { ExpertAvatar } from '@/components/brand';
import { Badge, Button, EmptyState, Field, Input, Modal, Textarea } from '@/components/ui';
import { useToast } from '@/components/toast';
import { cn, relativeTime } from '@/lib/utils';

type ExpertCard = {
  id: string;
  name: string;
  description: string;
  icon: string;
  accent: string;
  category: string;
  visibility: string;
  usageCount: number;
  updatedAt: string;
  skillCount: number;
  kbCount: number;
  connectorCount: number;
};

const ICONS = [
  { id: 'spark', label: '通用' },
  { id: 'telescope', label: '研究' },
  { id: 'file-text', label: '文档' },
  { id: 'chart', label: '分析' },
  { id: 'code', label: '工程' },
  { id: 'globe', label: '市场' },
  { id: 'brain', label: '策略' },
  { id: 'database', label: '数据' },
];

const ACCENTS = ['#7c6cff', '#22d3ee', '#f59e0b', '#34d399', '#f472b6', '#60a5fa'];

export function ExpertGallery({
  experts,
  canManage,
}: {
  experts: ExpertCard[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = React.useState('');
  const [category, setCategory] = React.useState('全部');
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    category: '通用',
    description: '',
    icon: 'spark',
    accent: '#7c6cff',
  });

  const categories = ['全部', ...Array.from(new Set(experts.map((item) => item.category)))];
  const filtered = experts.filter((expert) => {
    const matchCategory = category === '全部' || expert.category === category;
    const matchQuery =
      !query ||
      expert.name.toLowerCase().includes(query.toLowerCase()) ||
      expert.description.toLowerCase().includes(query.toLowerCase());
    return matchCategory && matchQuery;
  });

  const create = async () => {
    if (!form.name.trim()) {
      toast('请填写专家名称', { variant: 'error' });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/experts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          description: form.description || `${form.category}领域的专属 AI 专家`,
          systemPrompt: `你是${form.name}，${form.description || `专注于${form.category}领域`}。\n\n工作方式：\n1. 先理解目标与约束，必要时澄清；\n2. 拆解为可执行的步骤；\n3. 给出结论明确、可验收的成果。`,
          toolPolicy: 'dangerous',
          defaultMode: 'agent',
          visibility: 'team',
        }),
      });
      const data = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) throw new Error(data.error || '创建失败');
      toast('专家已创建，继续完善配置');
      setOpen(false);
      router.push(`/experts/${data.id}`);
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
              <Sparkles size={12} className="text-accent-2" />
              Experts
            </div>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">专家</h1>
            <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted">
              把人格、模型、技能、知识与连接器组合成可复用的「数字同事」。专家可被对话、任务与其他专家调用。
            </p>
          </div>
          {canManage ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus size={14} /> 新建专家
            </Button>
          ) : null}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface-2/50 p-1">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(
                  'h-7 rounded-lg px-2.5 text-[11.5px] transition',
                  category === item ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full max-w-[240px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索专家"
              className="h-9 pl-8"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<Sparkles size={18} />}
            title="还没有匹配的专家"
            description="创建一个专家，配置模型、技能与知识库，让它成为团队可复用的能力单元。"
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setOpen(true)}>
                  <Plus size={14} /> 新建专家
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((expert) => (
              <div
                key={expert.id}
                onClick={() => router.push(`/experts/${expert.id}`)}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong"
              >
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-20 blur-3xl transition group-hover:opacity-35"
                  style={{ background: expert.accent }}
                />
                <div className="flex items-start gap-3">
                  <ExpertAvatar icon={expert.icon} accent={expert.accent} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[14px] font-semibold text-ink">{expert.name}</h3>
                      {expert.visibility === 'public' ? (
                        <Badge variant="outline" className="shrink-0 scale-90">
                          公开
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-faint">
                      <span>{expert.category}</span>
                      <span className="h-2.5 w-px bg-line" />
                      <span>{expert.usageCount} 次调用</span>
                    </p>
                  </div>
                  <ArrowUpRight
                    size={14}
                    className="text-faint opacity-0 transition group-hover:opacity-100"
                  />
                </div>
                <p className="mt-3 line-clamp-2 min-h-[34px] text-[11.8px] leading-relaxed text-muted">
                  {expert.description || '暂无描述'}
                </p>
                <div className="mt-3.5 flex items-center gap-3 border-t border-line/70 pt-3 text-[10.5px] text-faint">
                  <span className="inline-flex items-center gap-1">
                    <Wand2 size={11} /> {expert.skillCount} 技能
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <BookOpen size={11} /> {expert.kbCount} 知识库
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Plug size={11} /> {expert.connectorCount} 连接
                  </span>
                  <span className="ml-auto">{relativeTime(expert.updatedAt)}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`/chat?expert=${expert.id}`);
                    }}
                  >
                    <MessageSquare size={12} /> 开始对话
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`/experts/${expert.id}`);
                    }}
                  >
                    配置
                  </Button>
                </div>
              </div>
            ))}
            {canManage ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex min-h-[196px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-faint transition hover:border-accent/30 hover:bg-accent/[0.03] hover:text-accent-2"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line">
                  <Plus size={18} />
                </span>
                <span className="text-[12px]">创建新的数字同事</span>
              </button>
            ) : null}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="新建专家"
        description="先创建基础人格，随后在编辑器中绑定模型、技能与知识库。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={creating} onClick={create}>
              创建并继续配置
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <ExpertAvatar icon={form.icon} accent={form.accent} size={48} />
            <div>
              <p className="text-[13px] font-medium text-ink">{form.name || '未命名专家'}</p>
              <p className="text-[11px] text-faint">{form.category} · 数字同事</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="名称" required>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：合规顾问"
              />
            </Field>
            <Field label="分类">
              <Input
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
                placeholder="研究 / 写作 / 分析"
              />
            </Field>
          </div>
          <Field label="一句话描述">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="这个专家擅长什么？适合处理哪些任务？"
            />
          </Field>
          <Field label="图标">
            <div className="flex flex-wrap gap-1.5">
              {ICONS.map((icon) => (
                <button
                  key={icon.id}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, icon: icon.id }))}
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] transition',
                    form.icon === icon.id
                      ? 'border-accent/40 bg-accent/10 text-accent-2'
                      : 'border-line text-muted hover:text-ink',
                  )}
                >
                  <ExpertAvatar icon={icon.id} accent={form.accent} size={18} />
                  {icon.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="主题色">
            <div className="flex gap-2">
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, accent }))}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition',
                    form.accent === accent ? 'border-white/70' : 'border-transparent',
                  )}
                  style={{ background: accent }}
                  aria-label={accent}
                />
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
