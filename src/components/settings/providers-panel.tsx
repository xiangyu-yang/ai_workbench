'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Cpu,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  Zap,
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
} from '@/components/ui';
import { useToast } from '@/components/toast';
import type { SettingsProvider } from '@/lib/settings-types';
import { cn } from '@/lib/utils';

type ModelRow = {
  id: string;
  name: string;
  inputPrice?: number;
  outputPrice?: number;
};

const KIND_LABEL: Record<string, string> = {
  openai: 'OpenAI 兼容',
  anthropic: 'Anthropic',
  ollama: 'Ollama 本地',
  mock: '内置演示',
};

const EMPTY_FORM = {
  name: '',
  kind: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  defaultModel: '',
  embeddingModel: '',
  isDefault: false,
  enabled: true,
};

export function ProvidersPanel({ providers }: { providers: SettingsProvider[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SettingsProvider | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [models, setModels] = React.useState<ModelRow[]>([{ id: '', name: '' }]);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [discovered, setDiscovered] = React.useState<{ providerId: string; models: string[] } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = React.useState<SettingsProvider | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModels([{ id: '', name: '' }]);
    setOpen(true);
  };

  const openEdit = (provider: SettingsProvider) => {
    setEditing(provider);
    setForm({
      name: provider.name,
      kind: provider.kind,
      baseUrl: provider.baseUrl,
      apiKey: '',
      defaultModel: provider.defaultModel,
      embeddingModel: provider.embeddingModel,
      isDefault: provider.isDefault,
      enabled: provider.enabled,
    });
    setModels(
      provider.models.length
        ? provider.models.map((model) => ({
            id: model.id,
            name: model.name,
            inputPrice: model.inputPrice,
            outputPrice: model.outputPrice,
          }))
        : [{ id: '', name: '' }],
    );
    setOpen(true);
  };

  const updateModel = (index: number, patch: Partial<ModelRow>) =>
    setModels((prev) => prev.map((model, i) => (i === index ? { ...model, ...patch } : model)));

  const save = async () => {
    if (!form.name.trim()) {
      toast('请填写供应商名称', { variant: 'error' });
      return;
    }
    if (form.kind !== 'mock' && !form.baseUrl.trim()) {
      toast('请填写 Base URL', { variant: 'error' });
      return;
    }
    const cleaned = models
      .filter((model) => model.id.trim())
      .map((model) => ({
        id: model.id.trim(),
        name: model.name.trim() || model.id.trim(),
        ...(model.inputPrice !== undefined ? { inputPrice: Number(model.inputPrice) } : {}),
        ...(model.outputPrice !== undefined ? { outputPrice: Number(model.outputPrice) } : {}),
      }));
    if (!cleaned.length) {
      toast('至少配置一个模型', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        models: cleaned,
        defaultModel: form.defaultModel || cleaned[0].id,
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
      };
      const response = await fetch(
        editing ? `/api/providers/${editing.id}` : '/api/providers',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast(editing ? '供应商已更新' : '供应商已添加', { variant: 'success' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const test = async (provider: SettingsProvider) => {
    setTesting(provider.id);
    setDiscovered(null);
    try {
      const response = await fetch(`/api/providers/${provider.id}/test`, { method: 'POST' });
      const data = (await response.json()) as {
        error?: string;
        models?: string[];
        latencyMs?: number;
      };
      if (!response.ok) throw new Error(data.error || '连接失败');
      setDiscovered({ providerId: provider.id, models: data.models || [] });
      toast(`连接成功 · ${data.models?.length || 0} 个模型 · ${data.latencyMs}ms`, {
        variant: 'success',
      });
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setTesting(null);
    }
  };

  const importModels = (providerId: string, ids: string[]) => {
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return;
    openEdit(provider);
    setModels(ids.map((id) => ({ id, name: id })));
    setForm((prev) => ({ ...prev, defaultModel: ids[0] || prev.defaultModel }));
    toast('已填入模型列表，保存后生效');
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/providers/${deleteTarget.id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '删除失败');
      toast('供应商已删除');
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-medium text-ink">模型供应商</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            统一网关支持 OpenAI 兼容、Anthropic 与 Ollama 原生协议；密钥加密保存。
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <Plus size={13} /> 添加供应商
        </Button>
      </div>

      {providers.length === 0 ? (
        <EmptyState
          icon={<Cpu size={18} />}
          title="使用内置演示模型"
          description="当前没有配置真实模型。添加 OpenAI / DeepSeek / Anthropic 等供应商后，专家将自动使用真实推理能力。"
          action={
            <Button variant="primary" onClick={openCreate}>
              <Plus size={14} /> 添加供应商
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="rounded-xl border border-line bg-surface-2 p-4"
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-accent-2">
                  <Sparkles size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-medium text-ink">{provider.name}</p>
                    <Badge variant="outline">{KIND_LABEL[provider.kind] || provider.kind}</Badge>
                    {provider.isDefault ? (
                      <Badge variant="accent">
                        <Star size={9} /> 默认
                      </Badge>
                    ) : null}
                    {provider.kind === 'ollama' ? (
                      <Badge variant="outline">本地</Badge>
                    ) : provider.hasKey ? (
                      <Badge variant="success">密钥已配置</Badge>
                    ) : (
                      <Badge variant="warning">无密钥</Badge>
                    )}
                    {!provider.enabled ? <Badge variant="danger">已停用</Badge> : null}
                  </div>
                  <p className="mt-1 truncate font-mono text-[10.5px] text-faint">
                    {provider.baseUrl || '内置'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(provider.models.length ? provider.models : [{ id: provider.defaultModel || '未配置模型' }])
                      .slice(0, 6)
                      .map((model) => (
                        <span
                          key={model.id}
                          className={cn(
                            'rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]',
                            model.id === provider.defaultModel ? 'text-accent-2' : 'text-muted',
                          )}
                        >
                          {model.id}
                        </span>
                      ))}
                    {provider.models.length > 6 ? (
                      <span className="text-[10px] text-faint">+{provider.models.length - 6}</span>
                    ) : null}
                  </div>
                  {discovered?.providerId === provider.id ? (
                    <div className="mt-3 rounded-lg border border-cyan/20 bg-cyan/[0.04] p-2.5">
                      <p className="flex items-center gap-1.5 text-[10.5px] text-cyan">
                        <CheckCircle2 size={11} /> 在线可用模型
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {discovered.models.slice(0, 16).map((id) => (
                          <span
                            key={id}
                            className="rounded border border-line px-1.5 py-0.5 font-mono text-[9.5px] text-muted"
                          >
                            {id}
                          </span>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="mt-1.5 h-6 px-1.5 text-[10px]"
                        onClick={() => importModels(provider.id, discovered.models)}
                      >
                        导入到模型列表
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={testing === provider.id}
                    onClick={() => test(provider)}
                  >
                    <Zap size={11} /> 测试
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(provider)}>
                    编辑
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget(provider)}
                    aria-label="删除"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-[11px] leading-relaxed text-faint">
        <p className="font-medium text-muted">配置建议</p>
        <p className="mt-1">
          DeepSeek：<code className="text-accent-2">https://api.deepseek.com</code>，模型{' '}
          <code className="text-accent-2">deepseek-chat</code>；OpenAI：
          <code className="text-accent-2">https://api.openai.com/v1</code>；本地 Ollama：选择「Ollama 本地（原生）」，地址 <code className="text-accent-2">http://127.0.0.1:11434</code>；原生协议会使用 16k 上下文并稳定处理思考模型。
        </p>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? '编辑模型供应商' : '添加模型供应商'}
        description="保存后可在「测试」中拉取在线模型列表，并一键导入。"
        width="max-w-xl"
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
            <Field label="名称" required>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="DeepSeek"
              />
            </Field>
            <Field label="协议">
              <Select
                value={form.kind}
                onChange={(event) => {
                  const kind = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    kind,
                    ...(kind === 'ollama' ? { baseUrl: 'http://127.0.0.1:11434' } : {}),
                    ...(kind === 'openai' && prev.kind === 'ollama'
                      ? { baseUrl: 'https://api.openai.com/v1' }
                      : {}),
                  }));
                }}
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="ollama">Ollama 本地（原生）</option>
                <option value="anthropic">Anthropic</option>
                <option value="mock">内置演示</option>
              </Select>
            </Field>
          </div>
          {form.kind !== 'mock' ? (
            <>
              <Field
                label="Base URL"
                required
                hint="OpenAI 兼容需包含版本前缀（如 /v1）；Ollama 原生填 http://127.0.0.1:11434；Anthropic 可填 https://api.anthropic.com"
              >
                <Input
                  value={form.baseUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, baseUrl: event.target.value }))}
                  className="font-mono text-[12px]"
                />
              </Field>
              <Field
                label="API Key"
                hint={editing ? '留空表示保持原密钥；填写将覆盖' : '加密存储，前端永不回显'}
              >
                <Input
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => setForm((prev) => ({ ...prev, apiKey: event.target.value }))}
                  placeholder={editing?.hasKey ? '已配置，留空保持不变' : 'sk-...'}
                  className="font-mono text-[12px]"
                />
              </Field>
            </>
          ) : null}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12px] font-medium text-muted">模型列表</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setModels((prev) => [...prev, { id: '', name: '' }])}
              >
                <Plus size={12} /> 添加模型
              </Button>
            </div>
            <div className="space-y-2">
              {models.map((model, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_80px_80px_28px] items-center gap-1.5">
                  <Input
                    value={model.id}
                    onChange={(event) => updateModel(index, { id: event.target.value })}
                    placeholder="模型 ID"
                    className="h-9 font-mono text-[11px]"
                  />
                  <Input
                    value={model.name}
                    onChange={(event) => updateModel(index, { name: event.target.value })}
                    placeholder="显示名"
                    className="h-9 text-[11px]"
                  />
                  <Input
                    type="number"
                    value={model.inputPrice ?? ''}
                    onChange={(event) =>
                      updateModel(index, {
                        inputPrice: event.target.value ? Number(event.target.value) : undefined,
                      })
                    }
                    placeholder="入价"
                    className="h-9 text-[11px]"
                    title="输入价格（USD / 百万 token）"
                  />
                  <Input
                    type="number"
                    value={model.outputPrice ?? ''}
                    onChange={(event) =>
                      updateModel(index, {
                        outputPrice: event.target.value ? Number(event.target.value) : undefined,
                      })
                    }
                    placeholder="出价"
                    className="h-9 text-[11px]"
                    title="输出价格（USD / 百万 token）"
                  />
                  <button
                    type="button"
                    onClick={() => setModels((prev) => prev.filter((_, i) => i !== index))}
                    className="flex h-8 w-7 items-center justify-center rounded text-faint transition hover:text-danger"
                    aria-label="删除模型"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[10.5px] text-faint">
              价格用于成本估算，单位：USD / 百万 token；可留空。
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="默认模型">
              <Input
                value={form.defaultModel}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, defaultModel: event.target.value }))
                }
                placeholder="留空取第一个"
                className="font-mono text-[11.5px]"
              />
            </Field>
            <Field label="嵌入模型" hint="用于知识库；需支持 /embeddings">
              <Input
                value={form.embeddingModel}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, embeddingModel: event.target.value }))
                }
                placeholder="text-embedding-3-small"
                className="font-mono text-[11.5px]"
              />
            </Field>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <div>
              <p className="text-[12px] font-medium text-ink">设为组织默认供应商</p>
              <p className="text-[10.5px] text-faint">未指定供应商的专家将使用该配置</p>
            </div>
            <Switch
              checked={form.isDefault}
              onChange={(value) => setForm((prev) => ({ ...prev, isDefault: value }))}
              label="默认供应商"
            />
          </div>
        </div>
      </Drawer>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除模型供应商？"
        description="使用该供应商的专家将回退到组织默认设置；若没有其他供应商，将使用内置演示模型。"
        size="sm"
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
        <p className="text-[12.5px] text-muted">确认删除「{deleteTarget?.name}」？</p>
      </Modal>

      {testing ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[11px] text-muted shadow-xl">
          <RefreshCw size={11} className="animate-spin text-cyan" /> 正在测试连接…
        </div>
      ) : null}
    </div>
  );
}
