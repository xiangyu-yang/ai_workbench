'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorBox,
  Field,
  Input,
  Modal,
  Progress,
  Select,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { bytes, cn, formatNumber, relativeTime } from '@/lib/utils';

type Base = {
  id: string;
  name: string;
  description: string;
  chunkSize: number;
  chunkOverlap: number;
  embeddingProviderId: string | null;
  embeddingModel: string;
  docCount: number;
  chunkCount: number;
  updatedAt: string;
};

type Doc = {
  id: string;
  name: string;
  mime: string;
  size: number;
  status: string;
  error: string;
  charCount: number;
  chunkCount: number;
  createdAt: string;
};

type Provider = { id: string; name: string; embeddingModel: string; kind: string };

type UploadItem = { id: string; name: string; status: 'uploading' | 'done' | 'error'; message?: string };

type SearchResult = {
  title: string;
  snippet: string;
  content: string;
  score: number;
  vectorScore: number;
  lexicalScore: number;
  ordinal: number;
};

export function KnowledgeDetail({
  base,
  documents,
  providers,
  canManage,
}: {
  base: Base;
  documents: Doc[];
  providers: Provider[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [dragOver, setDragOver] = React.useState(false);
  const [uploads, setUploads] = React.useState<UploadItem[]>([]);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [docTarget, setDocTarget] = React.useState<Doc | null>(null);
  const [query, setQuery] = React.useState('');
  const [searching, setSearching] = React.useState(false);
  const [results, setResults] = React.useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = React.useState('');
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [form, setForm] = React.useState({
    name: base.name,
    description: base.description,
    chunkSize: base.chunkSize,
    chunkOverlap: base.chunkOverlap,
    embeddingProviderId: base.embeddingProviderId || '',
    embeddingModel: base.embeddingModel,
  });
  const [saving, setSaving] = React.useState(false);

  const uploading = uploads.some((item) => item.status === 'uploading');

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).slice(0, 10);
    if (!list.length) return;
    const items: UploadItem[] = list.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      status: 'uploading',
    }));
    setUploads((prev) => [...prev, ...items]);

    for (const [index, file] of list.entries()) {
      const item = items[index];
      try {
        if (file.size > 15 * 1024 * 1024) throw new Error('文件超过 15MB 限制');
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`/api/knowledge/${base.id}/documents`, {
          method: 'POST',
          body: formData,
        });
        const data = (await response.json()) as { error?: string; chunkCount?: number };
        if (!response.ok) throw new Error(data.error || '上传失败');
        setUploads((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: 'done', message: `${data.chunkCount || 0} 个片段` }
              : entry,
          ),
        );
      } catch (err) {
        setUploads((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, status: 'error', message: (err as Error).message } : entry,
          ),
        );
      }
    }
    router.refresh();
    setTimeout(() => setUploads((prev) => prev.filter((item) => item.status === 'error')), 2500);
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/knowledge/${base.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...form,
          embeddingProviderId: form.embeddingProviderId || null,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast('知识库设置已保存（新文档生效）', { variant: 'success' });
      setSettingsOpen(false);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const removeBase = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/knowledge/${base.id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '删除失败');
      toast('知识库已删除');
      router.push('/knowledge');
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const removeDoc = async () => {
    if (!docTarget) return;
    try {
      const response = await fetch(`/api/knowledge/${base.id}/documents/${docTarget.id}`, {
        method: 'DELETE',
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '删除失败');
      toast('文档已删除');
      setDocTarget(null);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    }
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError('');
    setResults(null);
    try {
      const response = await fetch(`/api/knowledge/${base.id}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, topK: 6 }),
      });
      const data = (await response.json()) as { results?: SearchResult[]; error?: string };
      if (!response.ok) throw new Error(data.error || '检索失败');
      setResults(data.results || []);
    } catch (err) {
      setSearchError((err as Error).message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-[1180px] px-6 py-7 lg:px-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Link
              href="/knowledge"
              className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-faint transition hover:text-ink"
            >
              <ArrowLeft size={15} />
            </Link>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent-2">
              <BookOpen size={19} />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-ink">
                {base.name}
              </h1>
              <p className="mt-0.5 text-[11.5px] text-faint">
                {base.docCount} 份文档 · {formatNumber(base.chunkCount)} 个片段 · 更新于{' '}
                {relativeTime(base.updatedAt)}
              </p>
            </div>
          </div>
          {canManage ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={13} /> 设置
              </Button>
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                <Trash2 size={13} /> 删除
              </Button>
            </div>
          ) : null}
        </div>

        <div className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            {canManage ? (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files);
                }}
                className={cn(
                  'rounded-2xl border border-dashed p-6 text-center transition',
                  dragOver ? 'border-accent/60 bg-accent/[0.05]' : 'border-line bg-surface-2',
                )}
              >
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  multiple
                  accept=".pdf,.docx,.txt,.md,.csv,.json,.html"
                  onChange={(event) => {
                    if (event.target.files?.length) void uploadFiles(event.target.files);
                    event.target.value = '';
                  }}
                />
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-muted">
                  <UploadCloud size={19} />
                </span>
                <p className="mt-3 text-[13px] font-medium text-ink">拖拽文件到这里，或点击上传</p>
                <p className="mt-1 text-[11px] text-faint">
                  支持 PDF / DOCX / TXT / MD / CSV / JSON / HTML，单文件 ≤ 15MB
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  loading={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  选择文件
                </Button>
              </div>
            ) : null}

            {uploads.length ? (
              <div className="space-y-1.5">
                {uploads.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[11px]"
                  >
                    {item.status === 'uploading' ? (
                      <Loader2 size={12} className="animate-spin text-cyan" />
                    ) : item.status === 'done' ? (
                      <CheckCircle2 size={12} className="text-success" />
                    ) : (
                      <AlertCircle size={12} className="text-danger" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-muted">{item.name}</span>
                    <span className={item.status === 'error' ? 'text-danger' : 'text-faint'}>
                      {item.message || '解析与嵌入中…'}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <section className="panel overflow-hidden">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="text-[12.5px] font-medium text-ink">文档</p>
                <span className="text-[10.5px] text-faint">{documents.length} 份</span>
              </div>
              {documents.length === 0 ? (
                <div className="px-4 py-10 text-center text-[12px] text-faint">
                  还没有文档。上传后会自动解析与分块。
                </div>
              ) : (
                <div className="divide-y divide-line/70">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                        <FileText size={14} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-medium text-ink">{doc.name}</p>
                        <p className="mt-0.5 text-[10.5px] text-faint">
                          {bytes(doc.size)} · {formatNumber(doc.charCount)} 字符 ·{' '}
                          {doc.chunkCount} 片段 · {relativeTime(doc.createdAt)}
                        </p>
                        {doc.error ? (
                          <p className="mt-1 text-[10.5px] text-danger">{doc.error}</p>
                        ) : null}
                      </div>
                      <Badge
                        variant={
                          doc.status === 'ready'
                            ? 'success'
                            : doc.status === 'failed'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {doc.status === 'ready' ? '就绪' : doc.status === 'failed' ? '失败' : '处理中'}
                      </Badge>
                      {canManage ? (
                        <button
                          type="button"
                          onClick={() => setDocTarget(doc)}
                          className="rounded p-1.5 text-faint transition hover:bg-danger/10 hover:text-danger"
                          aria-label="删除文档"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="space-y-4">
            <section className="panel p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-2 text-cyan">
                  <Search size={13} />
                </span>
                <div>
                  <p className="text-[12.5px] font-medium text-ink">召回测试</p>
                  <p className="text-[10.5px] text-faint">验证检索质量，不影响线上对话</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void search();
                  }}
                  placeholder="输入一个问题或关键词"
                />
                <Button variant="secondary" loading={searching} onClick={search}>
                  检索
                </Button>
              </div>
              {searchError ? (
                <div className="mt-3">
                  <ErrorBox message={searchError} />
                </div>
              ) : null}

              {results ? (
                results.length === 0 ? (
                  <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
                    没有命中片段。尝试更具体的关键词，或确认文档已就绪。
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {results.map((result, index) => (
                      <div
                        key={index}
                        className="overflow-hidden rounded-lg border border-line bg-surface-2"
                      >
                        <button
                          type="button"
                          onClick={() => setExpanded(expanded === index ? null : index)}
                          className="w-full px-2.5 py-2 text-left"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-4 w-4 items-center justify-center rounded bg-accent/15 text-[9px] text-accent-2">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">
                              {result.title}
                            </span>
                            <span className="text-[10px] text-cyan">
                              {(result.score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[10.5px] leading-relaxed text-faint">
                            {result.snippet}
                          </p>
                        </button>
                        {expanded === index ? (
                          <div className="border-t border-line/70 px-2.5 py-2">
                            <p className="mb-1.5 flex gap-3 text-[9.5px] text-faint">
                              <span>向量 {(result.vectorScore * 100).toFixed(0)}%</span>
                              <span>词法 {(result.lexicalScore * 100).toFixed(0)}%</span>
                              <span>片段 {result.ordinal + 1}</span>
                            </p>
                            <p className="max-h-48 overflow-y-auto whitespace-pre-wrap text-[10.5px] leading-relaxed text-muted">
                              {result.content}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[10.5px] leading-relaxed text-faint">
                  <Sparkles size={12} className="mt-0.5 shrink-0 text-accent-2" />
                  系统使用向量余弦与词法覆盖的混合检索；中文无需额外分词器。
                </div>
              )}
            </section>

            <section className="panel p-4">
              <p className="text-[12px] font-medium text-ink">索引配置</p>
              <div className="mt-3 space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-faint">分块大小</span>
                  <span className="text-muted">{base.chunkSize} 字符</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-faint">重叠</span>
                  <span className="text-muted">{base.chunkOverlap} 字符</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-faint">嵌入模型</span>
                  <span className="truncate text-muted">
                    {base.embeddingModel || '本地哈希（512 维）'}
                  </span>
                </div>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-[10px] text-faint">索引完成度</p>
                <Progress
                  value={
                    documents.length
                      ? (documents.filter((doc) => doc.status === 'ready').length / documents.length) * 100
                      : 0
                  }
                  tone="success"
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      <Drawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="知识库设置"
        description="分块参数仅对后续上传的文档生效；已有文档需重新上传以重建索引。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={saveSettings}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="名称">
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Field>
          <Field label="描述">
            <Textarea
              rows={3}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="分块大小">
              <Input
                type="number"
                value={form.chunkSize}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, chunkSize: Number(event.target.value) }))
                }
              />
            </Field>
            <Field label="重叠">
              <Input
                type="number"
                value={form.chunkOverlap}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, chunkOverlap: Number(event.target.value) }))
                }
              />
            </Field>
          </div>
          <Field label="嵌入供应商" hint="留空使用本地确定性嵌入，无需外部服务">
            <Select
              value={form.embeddingProviderId}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, embeddingProviderId: event.target.value }))
              }
            >
              <option value="">本地哈希嵌入（512 维）</option>
              {providers
                .filter((provider) => provider.kind === 'openai' || provider.kind === 'ollama')
                .map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="嵌入模型 ID" hint="例如 text-embedding-3-small；需供应商支持 /embeddings">
            <Input
              value={form.embeddingModel}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, embeddingModel: event.target.value }))
              }
              placeholder="text-embedding-3-small"
              className="font-mono text-[12px]"
            />
          </Field>
        </div>
      </Drawer>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除知识库？"
        description="所有文档、片段与专家绑定将被删除，且不可恢复。"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="danger" loading={deleting} onClick={removeBase}>
              删除
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-muted">确认删除「{base.name}」？</p>
      </Modal>

      <Modal
        open={Boolean(docTarget)}
        onClose={() => setDocTarget(null)}
        title="删除文档？"
        description="该文档及其向量片段将被移除。"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDocTarget(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={removeDoc}>
              删除
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-muted">确认删除「{docTarget?.name}」？</p>
      </Modal>
    </div>
  );
}
