'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Check,
  MessageSquare,
  Plug,
  Plus,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Wand2,
} from 'lucide-react';
import { ExpertAvatar } from '@/components/brand';
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Progress,
  Select,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { cn, relativeTime } from '@/lib/utils';

type ExpertForm = {
  id: string;
  name: string;
  description: string;
  icon: string;
  accent: string;
  category: string;
  systemPrompt: string;
  providerId: string | null;
  modelId: string;
  temperature: number;
  maxSteps: number;
  toolPolicy: 'never' | 'dangerous' | 'always';
  defaultMode: string;
  visibility: string;
  version: number;
  usageCount: number;
  updatedAt: string;
};

const ICONS = ['spark', 'telescope', 'file-text', 'chart', 'code', 'globe', 'brain', 'database', 'pen', 'wand'];
const ACCENTS = ['#7c6cff', '#22d3ee', '#f59e0b', '#34d399', '#f472b6', '#60a5fa'];

export function ExpertEditor({
  expert,
  bindings,
  skills,
  knowledgeBases,
  connectors,
  providers,
  canEdit,
}: {
  expert: ExpertForm;
  bindings: { skillIds: string[]; kbIds: string[]; connectorIds: string[] };
  skills: Array<{ id: string; name: string; description: string; type: string; category: string }>;
  knowledgeBases: Array<{ id: string; name: string; docCount: number }>;
  connectors: Array<{ id: string; name: string; toolCount: number }>;
  providers: Array<{ id: string; name: string; kind: string; models: string[] }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [form, setForm] = React.useState<ExpertForm>(expert);
  const [selectedSkills, setSelectedSkills] = React.useState<string[]>(bindings.skillIds);
  const [selectedKbs, setSelectedKbs] = React.useState<string[]>(bindings.kbIds);
  const [selectedConnectors, setSelectedConnectors] = React.useState<string[]>(bindings.connectorIds);
  const [saving, setSaving] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const provider = providers.find((item) => item.id === form.providerId);
  const update = <K extends keyof ExpertForm>(key: K, value: ExpertForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggle = (list: string[], setList: (value: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/experts/${form.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          icon: form.icon,
          accent: form.accent,
          category: form.category,
          systemPrompt: form.systemPrompt,
          providerId: form.providerId,
          modelId: form.modelId,
          temperature: form.temperature,
          maxSteps: form.maxSteps,
          toolPolicy: form.toolPolicy,
          defaultMode: form.defaultMode,
          visibility: form.visibility,
          skillIds: selectedSkills,
          kbIds: selectedKbs,
          connectorIds: selectedConnectors,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast('专家配置已保存', { variant: 'success' });
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/experts/${form.id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '删除失败');
      toast('专家已删除');
      router.push('/experts');
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-[1180px] px-6 py-7 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/experts"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-faint transition hover:text-ink"
            >
              <ArrowLeft size={15} />
            </Link>
            <ExpertAvatar icon={form.icon} accent={form.accent} size={46} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[20px] font-semibold tracking-[-0.02em] text-ink">
                  {form.name}
                </h1>
                <Badge variant="outline">v{form.version}</Badge>
                {!canEdit ? <Badge variant="warning">只读</Badge> : null}
              </div>
              <p className="mt-0.5 text-[11.5px] text-faint">
                {form.category} · 已调用 {form.usageCount} 次 · 更新于 {relativeTime(form.updatedAt)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/chat?expert=${form.id}`}>
              <Button variant="secondary">
                <MessageSquare size={13} /> 开始对话
              </Button>
            </Link>
            {canEdit ? (
              <Button variant="primary" loading={saving} onClick={save}>
                <Save size={13} /> 保存配置
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <section className="panel p-5">
              <SectionTitle icon={<Bot size={14} />} title="基本信息" desc="专家在团队中的呈现方式" />
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="名称" required>
                  <Input
                    value={form.name}
                    disabled={!canEdit}
                    onChange={(event) => update('name', event.target.value)}
                  />
                </Field>
                <Field label="分类">
                  <Input
                    value={form.category}
                    disabled={!canEdit}
                    onChange={(event) => update('category', event.target.value)}
                  />
                </Field>
                <Field label="一句话描述" className="sm:col-span-2">
                  <Input
                    value={form.description}
                    disabled={!canEdit}
                    onChange={(event) => update('description', event.target.value)}
                    placeholder="团队在列表中看到的能力说明"
                  />
                </Field>
                <Field label="可见性">
                  <Select
                    value={form.visibility}
                    disabled={!canEdit}
                    onChange={(event) => update('visibility', event.target.value)}
                  >
                    <option value="private">私有（仅自己）</option>
                    <option value="team">团队可见</option>
                    <option value="public">组织公开</option>
                  </Select>
                </Field>
                <Field label="图标与主题色">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ICONS.slice(0, 8).map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => update('icon', icon)}
                        className={cn(
                          'rounded-lg border p-1 transition',
                          form.icon === icon ? 'border-accent/50 bg-accent/10' : 'border-line',
                        )}
                      >
                        <ExpertAvatar icon={icon} accent={form.accent} size={22} />
                      </button>
                    ))}
                    <span className="mx-1 h-5 w-px bg-line" />
                    {ACCENTS.map((accent) => (
                      <button
                        key={accent}
                        type="button"
                        disabled={!canEdit}
                        onClick={() => update('accent', accent)}
                        className={cn(
                          'h-5 w-5 rounded-full border-2',
                          form.accent === accent ? 'border-white/70' : 'border-transparent',
                        )}
                        style={{ background: accent }}
                        aria-label={accent}
                      />
                    ))}
                  </div>
                </Field>
              </div>
            </section>

            <section className="panel p-5">
              <SectionTitle
                icon={<Settings2 size={14} />}
                title="模型与运行参数"
                desc="决定专家的推理风格、步数与工具权限"
              />
              {providers.length === 0 ? (
                <div className="mt-4 rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2.5 text-[11.5px] leading-relaxed text-warning/90">
                  尚未配置模型供应商，当前将使用内置演示模型。
                  <Link href="/settings?tab=providers" className="ml-1 underline">
                    前往配置
                  </Link>
                </div>
              ) : null}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="模型供应商">
                  <Select
                    value={form.providerId || ''}
                    disabled={!canEdit}
                    onChange={(event) => update('providerId', event.target.value || null)}
                  >
                    <option value="">跟随组织默认</option>
                    {providers.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="模型 ID" hint={provider ? `可用：${provider.models.slice(0, 4).join('、') || '需在供应商中维护'}` : '留空则使用默认模型'}>
                  <Input
                    value={form.modelId}
                    disabled={!canEdit}
                    onChange={(event) => update('modelId', event.target.value)}
                    placeholder="例如 deepseek-chat"
                    className="font-mono text-[12px]"
                  />
                </Field>
                <Field label={`温度 ${form.temperature.toFixed(1)}`} hint="越低越稳定，越高越发散">
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.1}
                    value={form.temperature}
                    disabled={!canEdit}
                    onChange={(event) => update('temperature', Number(event.target.value))}
                    className="h-9 w-full accent-[#7c6cff]"
                  />
                </Field>
                <Field label="最大工具步数" hint="1-24，超过后强制收口">
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={form.maxSteps}
                    disabled={!canEdit}
                    onChange={(event) => update('maxSteps', Number(event.target.value))}
                  />
                </Field>
                <Field label="工具审批策略" hint="危险操作是否必须人工批准">
                  <Select
                    value={form.toolPolicy}
                    disabled={!canEdit}
                    onChange={(event) =>
                      update('toolPolicy', event.target.value as ExpertForm['toolPolicy'])
                    }
                  >
                    <option value="never">自动执行（仍写审计）</option>
                    <option value="dangerous">危险操作需审批（推荐）</option>
                    <option value="always">逐动作审批</option>
                  </Select>
                </Field>
                <Field label="默认模式">
                  <Select
                    value={form.defaultMode}
                    disabled={!canEdit}
                    onChange={(event) => update('defaultMode', event.target.value)}
                  >
                    <option value="ask">问答</option>
                    <option value="plan">规划</option>
                    <option value="agent">执行</option>
                  </Select>
                </Field>
              </div>
            </section>

            <section className="panel p-5">
              <SectionTitle
                icon={<Wand2 size={14} />}
                title="角色与方法论"
                desc="系统提示词定义专家的工作方式与输出标准"
              />
              <div className="mt-4">
                <Textarea
                  rows={12}
                  value={form.systemPrompt}
                  disabled={!canEdit}
                  onChange={(event) => update('systemPrompt', event.target.value)}
                  placeholder="描述这个专家的角色、方法论、输出结构与边界…"
                  className="font-mono text-[12px] leading-relaxed"
                />
                <div className="mt-2 flex items-center justify-between text-[10.5px] text-faint">
                  <span>提示词会与组织规则、技能说明、知识引用规范合并</span>
                  <span>{form.systemPrompt.length} 字符</span>
                </div>
              </div>
            </section>

            <section className="panel p-5">
              <SectionTitle
                icon={<Wand2 size={14} />}
                title="技能"
                desc="注入方法论，或注册可调用的外部工具"
              />
              <div className="mt-4 space-y-2">
                {skills.length === 0 ? (
                  <EmptyRow
                    label="还没有技能"
                    action={
                      <Link href="/skills" className="text-accent-2 hover:underline">
                        创建技能
                      </Link>
                    }
                  />
                ) : (
                  skills.map((skill) => (
                    <ToggleRow
                      key={skill.id}
                      title={skill.name}
                      description={skill.description}
                      meta={skill.type === 'http' ? 'HTTP 工具' : '指令'}
                      checked={selectedSkills.includes(skill.id)}
                      disabled={!canEdit}
                      onChange={() => toggle(selectedSkills, setSelectedSkills, skill.id)}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="panel p-5">
              <SectionTitle icon={<BookOpen size={14} />} title="知识库" desc="回答前自动召回相关资料" />
              <div className="mt-4 space-y-2">
                {knowledgeBases.length === 0 ? (
                  <EmptyRow
                    label="还没有知识库"
                    action={
                      <Link href="/knowledge" className="text-accent-2 hover:underline">
                        创建知识库
                      </Link>
                    }
                  />
                ) : (
                  knowledgeBases.map((kb) => (
                    <ToggleRow
                      key={kb.id}
                      title={kb.name}
                      description={`${kb.docCount} 份文档`}
                      checked={selectedKbs.includes(kb.id)}
                      disabled={!canEdit}
                      onChange={() => toggle(selectedKbs, setSelectedKbs, kb.id)}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="panel p-5">
              <SectionTitle
                icon={<Plug size={14} />}
                title="连接器"
                desc="通过 MCP 让专家操作企业系统"
              />
              <div className="mt-4 space-y-2">
                {connectors.length === 0 ? (
                  <EmptyRow
                    label="还没有连接器"
                    action={
                      <Link href="/connectors" className="text-accent-2 hover:underline">
                        接入系统
                      </Link>
                    }
                  />
                ) : (
                  connectors.map((connector) => (
                    <ToggleRow
                      key={connector.id}
                      title={connector.name}
                      description={`${connector.toolCount} 个工具`}
                      checked={selectedConnectors.includes(connector.id)}
                      disabled={!canEdit}
                      onChange={() =>
                        toggle(selectedConnectors, setSelectedConnectors, connector.id)
                      }
                    />
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <div className="panel p-4">
              <div className="flex items-center gap-3">
                <ExpertAvatar icon={form.icon} accent={form.accent} size={42} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">{form.name}</p>
                  <p className="text-[10.5px] text-faint">{form.category}</p>
                </div>
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
                {form.description || '为这个专家补充一句话描述。'}
              </p>
              <div className="mt-4 space-y-2.5 border-t border-line pt-3 text-[11px]">
                <SummaryRow label="模型" value={form.modelId || provider?.name || '跟随默认'} />
                <SummaryRow label="温度" value={form.temperature.toFixed(1)} />
                <SummaryRow label="最大步数" value={String(form.maxSteps)} />
                <SummaryRow
                  label="审批"
                  value={
                    form.toolPolicy === 'never'
                      ? '自动执行'
                      : form.toolPolicy === 'dangerous'
                        ? '危险需审批'
                        : '逐动作审批'
                  }
                />
                <SummaryRow label="能力" value={`${selectedSkills.length} 技能 · ${selectedKbs.length} 知识库`} />
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[10.5px] text-faint">
                  <span>配置完整度</span>
                  <span>
                    {Math.min(
                      100,
                      30 +
                        (form.systemPrompt ? 25 : 0) +
                        (selectedSkills.length ? 15 : 0) +
                        (selectedKbs.length ? 15 : 0) +
                        (form.modelId ? 15 : 0),
                    )}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    30 +
                    (form.systemPrompt ? 25 : 0) +
                    (selectedSkills.length ? 15 : 0) +
                    (selectedKbs.length ? 15 : 0) +
                    (form.modelId ? 15 : 0)
                  }
                />
              </div>
            </div>

            <div className="panel p-4">
              <p className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                <ShieldCheck size={13} className="text-success" /> 运行时行为
              </p>
              <ul className="mt-2.5 space-y-2 text-[11px] leading-relaxed text-muted">
                <li>· 自动召回绑定的知识库，并在回答中标注来源</li>
                <li>· 危险工具调用将按策略生成审批单</li>
                <li>· 每次运行记录模型、token、成本与工具轨迹</li>
                <li>· 委派调用以独立上下文运行，最多两级</li>
              </ul>
            </div>

            {canEdit ? (
              <div className="rounded-xl border border-danger/20 bg-danger/[0.03] p-4">
                <p className="text-[12px] font-medium text-danger">危险区域</p>
                <p className="mt-1 text-[11px] leading-relaxed text-faint">
                  删除后，相关绑定会解除，历史消息保留。
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 size={12} /> 删除专家
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除专家？"
        description="该操作不可撤销，关联的技能 / 知识库 / 连接器绑定会一并解除。"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="danger" loading={deleting} onClick={remove}>
              删除
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-muted">确认删除「{form.name}」？</p>
      </Modal>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-surface-2 text-accent-2">
        {icon}
      </span>
      <div>
        <h2 className="text-[13px] font-medium text-ink">{title}</h2>
        <p className="mt-0.5 text-[11px] text-faint">{desc}</p>
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  meta,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  meta?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition',
        checked
          ? 'border-accent/25 bg-accent/[0.05]'
          : 'border-line bg-surface-2 hover:border-line-strong',
        disabled && 'cursor-default opacity-70',
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
          checked ? 'border-accent bg-accent text-white' : 'border-line',
        )}
      >
        {checked ? <Check size={10} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[12px] font-medium text-ink">
          {title}
          {meta ? <Badge variant="outline" className="scale-90">{meta}</Badge> : null}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-faint">{description}</span>
      </span>
    </button>
  );
}

function EmptyRow({ label, action }: { label: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-dashed border-line px-3 py-3 text-[11.5px] text-faint">
      <span className="flex items-center gap-1.5">
        <Plus size={12} /> {label}
      </span>
      {action}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-faint">{label}</span>
      <span className="truncate text-ink">{value}</span>
    </div>
  );
}
