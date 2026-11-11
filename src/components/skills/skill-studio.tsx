'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  ChevronRight,
  Download,
  FileCode2,
  FileText,
  FolderPlus,
  ImageIcon,
  Loader2,
  Plus,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { Markdown } from '@/components/chat/markdown';
import { cn, relativeTime } from '@/lib/utils';

type SkillFileInfo = {
  id?: string;
  path: string;
  kind: 'skill' | 'reference' | 'script' | 'asset' | 'other';
  mime: string;
  size: number;
  encoding: 'utf8' | 'base64';
  content: string;
  updatedAt?: string;
};

type SkillInfo = {
  id: string;
  name: string;
  description: string;
  type: string;
  category: string;
  version: number;
  status: string;
  visibility: string;
  updatedAt: string;
  manifest?: { tools?: unknown[] };
};

type ValidationInfo = {
  errors: string[];
  frontmatter?: Record<string, unknown>;
  body?: string;
};

const DIRECTORIES = [
  { value: 'references', label: 'references/ · 参考资料' },
  { value: 'scripts', label: 'scripts/ · 可执行脚本' },
  { value: 'assets', label: 'assets/ · 图片与资源' },
];

const FILE_TEMPLATES: Record<string, string> = {
  '.md': '# 参考标题\n\n## 适用场景\n\n## 关键要点\n\n- \n',
  '.json': '{\n  "key": "value"\n}\n',
  '.csv': '列1,列2\n',
  '.mjs': '#!/usr/bin/env node\n// 读取参数并输出结果\nconst args = process.argv.slice(2);\nconsole.log(JSON.stringify({ ok: true, args }));\n',
  '.js': '#!/usr/bin/env node\nconsole.log(JSON.stringify({ ok: true }));\n',
  '.py': 'import sys\nprint({"ok": True, "args": sys.argv[1:]})\n',
  '.sh': '#!/usr/bin/env bash\nset -euo pipefail\necho "ok"\n',
};

function fileIcon(kind: SkillFileInfo['kind']) {
  if (kind === 'skill') return <BadgeCheck size={14} />;
  if (kind === 'script') return <FileCode2 size={14} />;
  if (kind === 'asset') return <ImageIcon size={14} />;
  return <FileText size={14} />;
}

function groupFiles(files: SkillFileInfo[]) {
  return {
    entry: files.find((file) => file.kind === 'skill') || null,
    references: files.filter((file) => file.kind === 'reference'),
    scripts: files.filter((file) => file.kind === 'script'),
    assets: files.filter((file) => file.kind === 'asset'),
  };
}

function bytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function SkillStudio({
  skill: initialSkill,
  files: initialFiles,
  versions,
  boundExperts,
  validation: initialValidation,
  canManage,
}: {
  skill: SkillInfo;
  files: SkillFileInfo[];
  versions: Array<{ version: number; createdAt: string }>;
  boundExperts: Array<{ id: string; name: string }>;
  validation: ValidationInfo;
  canManage: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [skill, setSkill] = React.useState(initialSkill);
  const [files, setFiles] = React.useState(initialFiles);
  const [validation, setValidation] = React.useState(initialValidation);
  const [activePath, setActivePath] = React.useState(
    initialFiles.find((file) => file.kind === 'skill')?.path || initialFiles[0]?.path || 'SKILL.md',
  );
  const [draft, setDraft] = React.useState(
    initialFiles.find((file) => file.path === activePath)?.content || '',
  );
  const [dirty, setDirty] = React.useState(false);
  const [preview, setPreview] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createDir, setCreateDir] = React.useState('references');
  const [createName, setCreateName] = React.useState('');
  const [deleteTarget, setDeleteTarget] = React.useState<SkillFileInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsForm, setSettingsForm] = React.useState({
    name: skill.name,
    description: skill.description,
    category: skill.category,
    visibility: skill.visibility,
  });
  const [jsonOpen, setJsonOpen] = React.useState(false);
  const [jsonDraft, setJsonDraft] = React.useState(
    JSON.stringify({ tools: initialSkill.manifest?.tools || [] }, null, 2),
  );
  const [deleteSkillOpen, setDeleteSkillOpen] = React.useState(false);
  const [deletingSkill, setDeletingSkill] = React.useState(false);
  const uploadRef = React.useRef<HTMLInputElement>(null);

  const active = files.find((file) => file.path === activePath) || null;
  const groups = groupFiles(files);
  const isText = active?.encoding === 'utf8' && active.kind !== 'asset';
  const errorCount = validation.errors.length;

  const load = async (selectPath?: string) => {
    const response = await fetch(`/api/skills/${skill.id}`);
    if (!response.ok) return;
    const data = (await response.json()) as {
      skill: SkillInfo;
      files: SkillFileInfo[];
      validation: ValidationInfo;
    };
    setSkill(data.skill);
    setFiles(data.files);
    setValidation(data.validation);
    setSettingsForm({
      name: data.skill.name,
      description: data.skill.description,
      category: data.skill.category,
      visibility: data.skill.visibility,
    });
    const wanted = selectPath || activePath;
    const current = data.files.find((file) => file.path === wanted) || data.files[0];
    if (current) {
      setActivePath(current.path);
      setDraft(current.content);
      setDirty(false);
    }
    setJsonDraft(JSON.stringify({ tools: data.skill.manifest?.tools || [] }, null, 2));
    router.refresh();
  };

  const selectFile = (file: SkillFileInfo) => {
    if (dirty && !window.confirm('当前文件有未保存修改，切换将丢失。继续？')) return;
    setActivePath(file.path);
    setDraft(file.content);
    setDirty(false);
    setPreview(file.kind !== 'script' && file.kind !== 'asset');
  };

  const save = async () => {
    if (!active || !isText) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/skills/${skill.id}/files`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: active.path,
          content: draft,
          encoding: 'utf8',
          mime: active.mime,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        validation?: { errors?: string[] };
      };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast('文件已保存', { variant: 'success' });
      setDirty(false);
      await load();
      if (data.validation?.errors?.length) {
        toast(`已保存草稿，但发布校验有 ${data.validation.errors.length} 个问题`, {
          variant: 'info',
        });
      }
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      if (dirty) await save();
      const response = await fetch(`/api/skills/${skill.id}/publish`, { method: 'POST' });
      const data = (await response.json()) as { error?: string; version?: number };
      if (!response.ok) throw new Error(data.error || '发布失败');
      toast(`已发布 v${data.version}`, { variant: 'success' });
      await load();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
      await load();
    } finally {
      setPublishing(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch(`/api/skills/${skill.id}/upload`, {
        method: 'POST',
        body: form,
      });
      const data = (await response.json()) as { error?: string; path?: string };
      if (!response.ok) throw new Error(data.error || '上传失败');
      toast('资源已上传', { variant: 'success' });
      await load(data.path);
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const createFile = async () => {
    const name = createName.trim().replace(/^\/+/, '');
    if (!name) {
      toast('请填写文件名', { variant: 'error' });
      return;
    }
    const ext = name.includes('.') ? `.${name.split('.').pop()?.toLowerCase()}` : '.md';
    const filePath = `${createDir}/${name}`;
    const content = FILE_TEMPLATES[ext] || (createDir === 'references' ? FILE_TEMPLATES['.md'] : '');
    try {
      const response = await fetch(`/api/skills/${skill.id}/files`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: filePath, content, encoding: 'utf8' }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '创建失败');
      toast('文件已创建');
      setCreateOpen(false);
      setCreateName('');
      await load(filePath);
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    }
  };

  const removeFile = async () => {
    if (!deleteTarget) return;
    try {
      const response = await fetch(
        `/api/skills/${skill.id}/files?path=${encodeURIComponent(deleteTarget.path)}`,
        { method: 'DELETE' },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '删除失败');
      toast('文件已删除');
      setDeleteTarget(null);
      if (deleteTarget.path === activePath) {
        setActivePath('SKILL.md');
        setDraft(files.find((file) => file.path === 'SKILL.md')?.content || '');
        setDirty(false);
      }
      await load();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    }
  };

  const saveSettings = async () => {
    try {
      const response = await fetch(`/api/skills/${skill.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settingsForm),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast('基本信息已更新');
      setSettingsOpen(false);
      await load();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    }
  };

  const removeSkill = async () => {
    setDeletingSkill(true);
    try {
      const response = await fetch(`/api/skills/${skill.id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '删除失败');
      toast('技能已删除');
      router.push('/skills');
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setDeletingSkill(false);
    }
  };

  const saveTools = async () => {
    try {
      const parsed = JSON.parse(jsonDraft) as { tools?: unknown[] };
      const response = await fetch(`/api/skills/${skill.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ manifest: { tools: parsed.tools || [], notes: '' } }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast('工具声明已保存');
      setJsonOpen(false);
      await load();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    }
  };

  const fileRow = (file: SkillFileInfo) => (
    <button
      key={file.path}
      type="button"
      onClick={() => selectFile(file)}
      className={cn(
        'group flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11.5px] transition',
        activePath === file.path
          ? 'bg-accent/10 text-ink'
          : 'text-muted hover:bg-surface-3 hover:text-ink',
      )}
    >
      <span className={cn('shrink-0', activePath === file.path ? 'text-accent-2' : 'text-faint')}>
        {fileIcon(file.kind)}
      </span>
      <span className="min-w-0 flex-1 truncate">{file.path.replace(/^.*\//, '')}</span>
      <span className="shrink-0 text-[9.5px] text-faint">{bytes(file.size)}</span>
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line/70 px-5 py-4 lg:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => router.push('/skills')}
              className="inline-flex items-center gap-1 text-[10.5px] text-faint transition hover:text-muted"
            >
              <ChevronRight size={11} className="rotate-180" />
              技能库
            </button>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[22px] font-semibold tracking-[-0.02em] text-ink">
                {skill.name}
              </h1>
              <Badge variant={skill.status === 'published' ? 'success' : 'outline'}>
                {skill.status === 'published' ? '已发布' : '草稿'}
              </Badge>
              <Badge variant="outline">v{skill.version}</Badge>
              {errorCount ? (
                <Badge variant="warning">
                  <AlertTriangle size={10} /> {errorCount} 个校验问题
                </Badge>
              ) : (
                <Badge variant="success">
                  <Check size={10} /> 包结构有效
                </Badge>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">
              {skill.description || '标准技能包：SKILL.md + references / scripts / assets'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(true)}>
              基本设置
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setJsonOpen(true)}>
              工具声明
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void load()}>
              重新校验
            </Button>
            <Button size="sm" variant="primary" loading={publishing} onClick={publish}>
              <Rocket size={12} /> 发布版本
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
        <aside className="w-full shrink-0 overflow-y-auto border-b border-line/70 px-3 py-3 scrollbar-thin xl:w-[245px] xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between px-2 pb-1.5">
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">包文件</span>
            <span className="text-[10px] text-faint">{files.length}</span>
          </div>
          <div className="space-y-0.5">
            {groups.entry ? fileRow(groups.entry) : null}
            {groups.references.length ? (
              <>
                <p className="px-2 pt-3 pb-1 text-[9.5px] uppercase tracking-[0.12em] text-faint">references</p>
                {groups.references.map(fileRow)}
              </>
            ) : null}
            {groups.scripts.length ? (
              <>
                <p className="px-2 pt-3 pb-1 text-[9.5px] uppercase tracking-[0.12em] text-faint">scripts</p>
                {groups.scripts.map(fileRow)}
              </>
            ) : null}
            {groups.assets.length ? (
              <>
                <p className="px-2 pt-3 pb-1 text-[9.5px] uppercase tracking-[0.12em] text-faint">assets</p>
                {groups.assets.map(fileRow)}
              </>
            ) : null}
          </div>
          {canManage ? (
            <div className="mt-3 space-y-1 border-t border-line/60 pt-3">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11.5px] text-muted transition hover:bg-surface-3 hover:text-ink"
              >
                <FolderPlus size={13} /> 新建文件
              </button>
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11.5px] text-muted transition hover:bg-surface-3 hover:text-ink"
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                上传资源
              </button>
              <input
                ref={uploadRef}
                type="file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
            </div>
          ) : null}
          <div className="mt-4 rounded-xl border border-line/70 bg-surface-2/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">包大小</p>
            <p className="mt-1 text-[13px] font-medium text-ink">
              {bytes(files.reduce((sum, file) => sum + file.size, 0))}
            </p>
            <p className="mt-0.5 text-[10px] text-faint">上限 10MB · 单文件 2MB</p>
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {active ? (
            <>
              <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line/60 px-3 lg:px-4">
                <span className="text-faint">{fileIcon(active.kind)}</span>
                <span className="truncate font-mono text-[11px] text-muted">{active.path}</span>
                {dirty ? <span className="h-1.5 w-1.5 rounded-full bg-warning" /> : null}
                <div className="ml-auto flex items-center gap-1.5">
                  {isText && (active.kind === 'skill' || active.kind === 'reference') ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPreview((value) => !value)}
                    >
                      {preview ? '编辑' : '预览'}
                    </Button>
                  ) : null}
                  {active.kind !== 'skill' && canManage ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(active)}
                      aria-label="删除文件"
                    >
                      <Trash2 size={13} />
                    </Button>
                  ) : null}
                  {isText && canManage ? (
                    <Button size="sm" variant="primary" loading={saving} onClick={save}>
                      <Save size={12} /> 保存
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                {active.kind === 'asset' ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-8">
                    {active.mime.startsWith('image/') && active.encoding === 'base64' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/skills/${skill.id}/files?path=${encodeURIComponent(active.path)}`}
                        alt={active.path}
                        className="max-h-[420px] max-w-full rounded-xl border border-line"
                      />
                    ) : (
                      <ImageIcon size={32} className="text-faint" />
                    )}
                    <p className="font-mono text-[11px] text-muted">{active.path}</p>
                    <p className="text-[10.5px] text-faint">
                      {active.mime} · {bytes(active.size)}
                    </p>
                    <a
                      href={`/api/skills/${skill.id}/files?path=${encodeURIComponent(active.path)}&download=1`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-muted transition hover:text-ink"
                    >
                      <Download size={12} /> 下载资源
                    </a>
                  </div>
                ) : preview && (active.kind === 'skill' || active.kind === 'reference') ? (
                  <div className="mx-auto max-w-3xl px-5 py-6 lg:px-8">
                    <Markdown>{draft.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')}</Markdown>
                  </div>
                ) : (
                  <textarea
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      setDirty(true);
                    }}
                    spellCheck={false}
                    className="h-full min-h-[420px] w-full resize-none bg-transparent px-4 py-4 font-mono text-[12px] leading-[1.75] text-ink outline-none placeholder:text-faint lg:px-6"
                    placeholder="在此编写文件内容…"
                  />
                )}
              </div>
              {validation.errors.length ? (
                <div className="shrink-0 border-t border-warning/20 bg-warning/[0.04] px-4 py-2.5">
                  <p className="text-[10.5px] font-medium text-warning">发布前需要处理</p>
                  <ul className="mt-1 space-y-0.5 text-[10.5px] text-muted">
                    {validation.errors.slice(0, 4).map((error) => (
                      <li key={error}>· {error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState
              className="m-auto"
              icon={<Wand2 size={18} />}
              title="选择或新建一个文件"
              description="标准技能包以 SKILL.md 为入口，可附带 references、scripts 与 assets。"
            />
          )}
        </section>

        <aside className="hidden w-[280px] shrink-0 overflow-y-auto border-l border-line/70 px-4 py-4 scrollbar-thin xl:block">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">包信息</p>
          <dl className="mt-2 space-y-2 text-[11.5px]">
            <div className="flex justify-between gap-3">
              <dt className="text-faint">分类</dt>
              <dd className="text-muted">{skill.category}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">可见性</dt>
              <dd className="text-muted">
                {skill.visibility === 'public' ? '组织公开' : skill.visibility === 'private' ? '私有' : '团队'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">更新时间</dt>
              <dd className="text-muted">{relativeTime(skill.updatedAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-faint">文件数</dt>
              <dd className="text-muted">{files.length}</dd>
            </div>
          </dl>

          <div className="mt-5">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">绑定专家</p>
            {boundExperts.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {boundExperts.map((expert) => (
                  <Badge key={expert.id} variant="outline">
                    <Sparkles size={9} /> {expert.name}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-faint">尚未绑定专家</p>
            )}
          </div>

          <div className="mt-5">
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-faint">版本历史</p>
            <div className="mt-2 space-y-1">
              {versions.length ? (
                versions.map((version) => (
                  <div
                    key={version.version}
                    className="flex items-center justify-between rounded-lg border border-line/60 px-2.5 py-1.5 text-[10.5px]"
                  >
                    <span className="font-mono text-muted">v{version.version}</span>
                    <span className="text-faint">{relativeTime(version.createdAt)}</span>
                  </div>
                ))
              ) : (
                <p className="text-[11px] text-faint">还未发布版本</p>
              )}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-line/70 bg-surface-2/30 p-3 text-[10.5px] leading-relaxed text-faint">
            <p className="font-medium text-muted">标准结构</p>
            <p className="mt-1 font-mono text-[10px]">SKILL.md</p>
            <p className="font-mono text-[10px]">references/</p>
            <p className="font-mono text-[10px]">scripts/</p>
            <p className="font-mono text-[10px]">assets/</p>
            <p className="mt-1.5">发布后版本不可变，可用于审计与回滚。</p>
          </div>
        </aside>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建技能包文件"
        description="文件必须位于 references、scripts 或 assets 目录。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={createFile}>
              创建文件
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="目录">
            <Select value={createDir} onChange={(event) => setCreateDir(event.target.value)}>
              {DIRECTORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="文件名" hint="自动根据扩展名填入模板内容">
            <Input
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              placeholder="例如：checklist.md / analyze.mjs"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除文件"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="danger" onClick={removeFile}>
              删除
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-muted">
          确定删除 <span className="font-mono text-ink">{deleteTarget?.path}</span>？该操作不可撤销。
        </p>
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title="基本设置"
        description="名称与描述会同步写入 SKILL.md frontmatter。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={saveSettings}>
              保存
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="名称" required>
            <Input
              value={settingsForm.name}
              onChange={(event) => setSettingsForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </Field>
          <Field label="描述">
            <Textarea
              rows={3}
              value={settingsForm.description}
              onChange={(event) =>
                setSettingsForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </Field>
          {canManage ? (
            <div className="flex items-center justify-between rounded-xl border border-danger/20 bg-danger/[0.03] px-3 py-2.5">
              <div>
                <p className="text-[12px] text-ink">删除技能</p>
                <p className="text-[10.5px] text-faint">同时删除包文件与历史版本，不影响已产生的对话</p>
              </div>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setSettingsOpen(false);
                  setDeleteSkillOpen(true);
                }}
              >
                删除
              </Button>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="分类">
              <Input
                value={settingsForm.category}
                onChange={(event) =>
                  setSettingsForm((prev) => ({ ...prev, category: event.target.value }))
                }
              />
            </Field>
            <Field label="可见性">
              <Select
                value={settingsForm.visibility}
                onChange={(event) =>
                  setSettingsForm((prev) => ({ ...prev, visibility: event.target.value }))
                }
              >
                <option value="team">团队</option>
                <option value="public">组织公开</option>
                <option value="private">私有</option>
              </Select>
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={deleteSkillOpen}
        onClose={() => setDeleteSkillOpen(false)}
        title="删除技能"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteSkillOpen(false)}>
              取消
            </Button>
            <Button variant="danger" loading={deletingSkill} onClick={removeSkill}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          确定删除 <span className="font-medium text-ink">{skill.name}</span>？包文件与版本快照会一并删除，绑定的专家将失去该技能。此操作不可撤销。
        </p>
      </Modal>

      <Modal
        open={jsonOpen}
        onClose={() => setJsonOpen(false)}
        title="HTTP 工具声明"
        description="声明式工具会作为可调用能力注入专家；包文件仍用于方法论与参考资料。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setJsonOpen(false)}>
              取消
            </Button>
            <Button variant="primary" onClick={saveTools}>
              保存声明
            </Button>
          </>
        }
      >
        <Textarea
          rows={14}
          value={jsonDraft}
          onChange={(event) => setJsonDraft(event.target.value)}
          className="font-mono text-[11.5px]"
          placeholder='{"tools":[]}'
        />
      </Modal>
    </div>
  );
}
