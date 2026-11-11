'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Braces,
  Code2,
  Plus,
  Search,
  Sparkles,
  Wand2,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { cn, relativeTime } from '@/lib/utils';

type SkillCard = {
  id: string;
  name: string;
  description: string;
  type: string;
  icon: string;
  category: string;
  version: number;
  status: string;
  visibility: string;
  toolCount: number;
  fileCount: number;
  expertCount: number;
  updatedAt: string;
};

export function SkillGallery({ skills, canManage }: { skills: SkillCard[]; canManage: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<'all' | 'instruction' | 'http'>('all');
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    category: '通用',
    description: '',
    template: 'blank' as 'blank' | 'research' | 'writing' | 'data',
  });

  const filtered = skills.filter((skill) => {
    const matchFilter = filter === 'all' || skill.type === filter;
    const matchQuery =
      !query ||
      skill.name.toLowerCase().includes(query.toLowerCase()) ||
      skill.description.toLowerCase().includes(query.toLowerCase());
    return matchFilter && matchQuery;
  });

  const create = async () => {
    if (!form.name.trim()) {
      toast('请填写技能名称', { variant: 'error' });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          description: form.description || '可复用的方法论与能力包',
          type: 'instruction',
          template: form.template,
          manifest: { tools: [] },
          visibility: 'team',
        }),
      });
      const data = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) throw new Error(data.error || '创建失败');
      toast('技能已创建');
      setOpen(false);
      router.push(`/skills/${data.id}`);
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
              <Wand2 size={12} className="text-accent-2" />
              Skills
            </div>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">技能</h1>
            <p className="mt-1.5 max-w-xl text-[12.5px] leading-relaxed text-muted">
              以 SKILL.md 为入口，组合 references / scripts / assets，形成可版本化发布、可被专家复用的标准能力包。
            </p>
          </div>
          {canManage ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus size={14} /> 新建技能
            </Button>
          ) : null}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-line bg-surface-2/50 p-1">
            {[
              { id: 'all', label: '全部' },
              { id: 'instruction', label: '标准技能包' },
              { id: 'http', label: 'HTTP 工具' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id as typeof filter)}
                className={cn(
                  'h-7 rounded-lg px-2.5 text-[11.5px] transition',
                  filter === item.id ? 'bg-surface-3 text-ink' : 'text-muted hover:text-ink',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="relative ml-auto w-full max-w-[240px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索技能"
              className="h-9 pl-8"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<Wand2 size={18} />}
            title="还没有技能"
            description="创建标准技能包：SKILL.md 定义方法与触发条件，references 提供细节，scripts 扩展执行能力。"
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setOpen(true)}>
                  <Plus size={14} /> 新建技能
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => router.push(`/skills/${skill.id}`)}
                className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                      skill.type === 'http'
                        ? 'border-cyan/25 bg-cyan/10 text-cyan'
                        : 'border-accent/25 bg-accent/10 text-accent-2',
                    )}
                  >
                    {skill.type === 'http' ? <Braces size={17} /> : <Sparkles size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[13.5px] font-semibold text-ink">{skill.name}</h3>
                      <Badge variant={skill.status === 'published' ? 'success' : 'outline'} className="shrink-0 scale-90">
                        {skill.status === 'published' ? '已发布' : '草稿'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-faint">
                      {skill.type === 'http'
                        ? `HTTP 工具 · ${skill.toolCount} 个`
                        : `技能包 · ${skill.fileCount || 1} 个文件`}{' '}
                      · v{skill.version}
                    </p>
                  </div>
                  <ArrowUpRight size={14} className="text-faint opacity-0 transition group-hover:opacity-100" />
                </div>
                <p className="mt-3 line-clamp-2 min-h-[34px] text-[11.8px] leading-relaxed text-muted">
                  {skill.description || '暂无描述'}
                </p>
                <div className="mt-3.5 flex items-center gap-3 border-t border-line/70 pt-3 text-[10.5px] text-faint">
                  <span className="inline-flex items-center gap-1">
                    <Code2 size={11} /> {skill.category}
                  </span>
                  <span>{skill.expertCount} 个专家在用</span>
                  <span className="ml-auto">{relativeTime(skill.updatedAt)}</span>
                </div>
              </button>
            ))}
            {canManage ? (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex min-h-[186px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line text-faint transition hover:border-accent/30 hover:bg-accent/[0.03] hover:text-accent-2"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-line">
                  <Plus size={18} />
                </span>
                <span className="text-[12px]">创建标准技能包</span>
              </button>
            ) : null}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="新建标准技能包"
        description="从模板开始，创建 SKILL.md 与配套资料；发布后即可绑定专家。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={creating} onClick={create}>
              创建并编辑
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="名称" required>
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="例如：结构化竞品分析"
            />
          </Field>
          <Field label="分类">
            <Input
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              placeholder="研究 / 写作 / 数据"
            />
          </Field>
          <Field label="描述">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="这个技能解决什么问题？适用于哪些场景？"
            />
          </Field>
          <Field label="模板">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'blank', label: '空白技能', hint: '只生成 SKILL.md' },
                { id: 'research', label: '研究分析', hint: '附研究检查清单' },
                { id: 'writing', label: '结构化写作', hint: '附风格指南' },
                { id: 'data', label: '数据分析', hint: '附指标口径模板' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, template: item.id as typeof form.template }))}
                  className={
                    form.template === item.id
                      ? 'rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-left'
                      : 'rounded-xl border border-line bg-surface-2/30 px-3 py-2.5 text-left transition hover:border-line-strong'
                  }
                >
                  <span className="block text-[11.5px] font-medium text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-[10px] text-faint">{item.hint}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
