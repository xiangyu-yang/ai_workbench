'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, BookOpen, Database, FileStack, Plus, Search } from 'lucide-react';
import { Badge, Button, EmptyState, Field, Input, Modal, Textarea } from '@/components/ui';
import { useToast } from '@/components/toast';
import { formatNumber, relativeTime } from '@/lib/utils';

type BaseCard = {
  id: string;
  name: string;
  description: string;
  docCount: number;
  chunkCount: number;
  chunkSize: number;
  embeddingModel: string;
  updatedAt: string;
};

export function KnowledgeGallery({
  bases,
  canManage,
}: {
  bases: BaseCard[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({
    name: '',
    description: '',
    chunkSize: 900,
    chunkOverlap: 120,
  });

  const filtered = bases.filter(
    (base) =>
      !query ||
      base.name.toLowerCase().includes(query.toLowerCase()) ||
      base.description.toLowerCase().includes(query.toLowerCase()),
  );

  const create = async () => {
    if (!form.name.trim()) {
      toast('请填写知识库名称', { variant: 'error' });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/knowledge', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) throw new Error(data.error || '创建失败');
      toast('知识库已创建，开始上传资料吧');
      setOpen(false);
      router.push(`/knowledge/${data.id}`);
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const totalDocs = bases.reduce((acc, base) => acc + base.docCount, 0);
  const totalChunks = bases.reduce((acc, base) => acc + base.chunkCount, 0);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-[1240px] px-6 py-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
              <BookOpen size={12} className="text-accent-2" />
              Knowledge
            </div>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">知识库</h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
              上传组织资料，自动解析、分块与嵌入。专家回答前会混合检索并标注来源，减少幻觉。
            </p>
          </div>
          {canManage ? (
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus size={14} /> 新建知识库
            </Button>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3">
          {[
            { label: '知识库', value: bases.length, icon: Database },
            { label: '文档', value: totalDocs, icon: FileStack },
            { label: '向量片段', value: totalChunks, icon: BookOpen },
          ].map((item) => (
            <div key={item.label} className="panel flex items-center gap-3 px-4 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                <item.icon size={14} />
              </span>
              <div>
                <p className="text-[18px] font-semibold tracking-tight text-ink">
                  {formatNumber(item.value)}
                </p>
                <p className="text-[10.5px] text-faint">{item.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-2">
          <div className="relative ml-auto w-full max-w-[260px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索知识库"
              className="h-9 pl-8"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon={<BookOpen size={18} />}
            title="还没有知识库"
            description="上传制度、产品文档、历史方案或客户资料，让专家基于组织事实回答。"
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setOpen(true)}>
                  <Plus size={14} /> 新建知识库
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((base) => (
              <button
                key={base.id}
                type="button"
                onClick={() => router.push(`/knowledge/${base.id}`)}
                className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 text-left transition-all hover:-translate-y-0.5 hover:border-line-strong"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent-2">
                    <BookOpen size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[13.5px] font-semibold text-ink">{base.name}</h3>
                    <p className="mt-0.5 text-[10.5px] text-faint">
                      {base.docCount} 份文档 · {formatNumber(base.chunkCount)} 个片段
                    </p>
                  </div>
                  <ArrowUpRight size={14} className="text-faint opacity-0 transition group-hover:opacity-100" />
                </div>
                <p className="mt-3 line-clamp-2 min-h-[34px] text-[11.8px] leading-relaxed text-muted">
                  {base.description || '暂无描述'}
                </p>
                <div className="mt-3.5 flex items-center gap-2 border-t border-line/70 pt-3 text-[10.5px] text-faint">
                  <Badge variant="outline" className="scale-90">
                    {base.embeddingModel ? base.embeddingModel : '本地哈希嵌入'}
                  </Badge>
                  <span className="ml-auto">更新于 {relativeTime(base.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="新建知识库"
        description="上传后会自动分块与嵌入；默认使用本地确定性嵌入，无需外部服务。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={creating} onClick={create}>
              创建并上传
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="名称" required>
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="例如：产品与制度知识库"
            />
          </Field>
          <Field label="描述">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="包含哪些资料？由谁维护？"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="分块大小" hint="字符数，建议 600-1200">
              <Input
                type="number"
                value={form.chunkSize}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, chunkSize: Number(event.target.value) }))
                }
              />
            </Field>
            <Field label="重叠长度" hint="字符数，建议 80-200">
              <Input
                type="number"
                value={form.chunkOverlap}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, chunkOverlap: Number(event.target.value) }))
                }
              />
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
