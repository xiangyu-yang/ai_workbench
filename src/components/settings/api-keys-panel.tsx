'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CopyButton,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import type { SettingsApiKey } from '@/lib/settings-types';
import { relativeTime } from '@/lib/utils';

export function ApiKeysPanel({ keys }: { keys: SettingsApiKey[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', scope: 'readwrite', days: 365 });
  const [creating, setCreating] = React.useState(false);
  const [createdKey, setCreatedKey] = React.useState<{ key: string; name: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = React.useState<SettingsApiKey | null>(null);
  const [revoking, setRevoking] = React.useState(false);

  const create = async () => {
    if (!form.name.trim()) {
      toast('请填写密钥名称', { variant: 'error' });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          scopes: form.scope === 'read' ? ['read'] : ['read', 'write'],
          expiresInDays: form.days || undefined,
        }),
      });
      const data = (await response.json()) as { error?: string; key?: string; name?: string };
      if (!response.ok) throw new Error(data.error || '创建失败');
      setCreatedKey({ key: data.key || '', name: data.name || form.name });
      setOpen(false);
      setForm({ name: '', scope: 'readwrite', days: 365 });
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setCreating(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const response = await fetch(`/api/api-keys/${revokeTarget.id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '撤销失败');
      toast('密钥已撤销');
      setRevokeTarget(null);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setRevoking(false);
    }
  };

  const active = keys.filter((key) => !key.revokedAt);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-medium text-ink">API 密钥</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            供外部系统调用公开 API（专家运行、知识检索、任务创建）。密钥仅创建时显示一次。
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          <Plus size={13} /> 创建密钥
        </Button>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
        <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" />
        <p className="text-[11px] leading-relaxed text-muted">
          使用方式：<code className="text-accent-2">Authorization: Bearer cw_xxx</code>。
          接口包括 <code className="text-accent-2">GET /api/v1/experts</code>、
          <code className="text-accent-2">POST /api/v1/experts/:id/run</code>、
          <code className="text-accent-2">POST /api/v1/knowledge/:id/search</code>、
          <code className="text-accent-2">POST /api/v1/tasks</code>。
        </p>
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={<KeyRound size={16} />}
          title="还没有 API 密钥"
          description="创建密钥，把 Cuter 的专家与知识能力接入你的业务系统。"
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus size={14} /> 创建密钥
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line/70">
            {active.map((key) => (
              <div key={key.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                  <KeyRound size={13} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[12px] font-medium text-ink">
                    {key.name}
                    {key.scopes.includes('write') ? (
                      <Badge variant="warning" className="scale-90">
                        读写
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="scale-90">
                        只读
                      </Badge>
                    )}
                  </p>
                  <p className="text-[10.5px] text-faint">
                    <span className="font-mono">cw_{key.prefix}_••••</span> · 创建于{' '}
                    {relativeTime(key.createdAt)} ·{' '}
                    {key.lastUsedAt ? `最近使用 ${relativeTime(key.lastUsedAt)}` : '从未使用'}
                  </p>
                </div>
                <span className="text-[10px] text-faint">
                  {key.expiresAt ? `到期 ${relativeTime(key.expiresAt)}` : '长期有效'}
                </span>
                <button
                  type="button"
                  onClick={() => setRevokeTarget(key)}
                  className="rounded p-1.5 text-faint transition hover:bg-danger/10 hover:text-danger"
                  aria-label="撤销密钥"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="创建 API 密钥"
        description="密钥只显示一次，请立即保存到安全的密钥管理系统中。"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button variant="primary" loading={creating} onClick={create}>
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="名称" required>
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="例如：CRM 同步任务"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="权限">
              <Select
                value={form.scope}
                onChange={(event) => setForm((prev) => ({ ...prev, scope: event.target.value }))}
              >
                <option value="readwrite">读写</option>
                <option value="read">只读</option>
              </Select>
            </Field>
            <Field label="有效期（天）">
              <Input
                type="number"
                min={1}
                max={365}
                value={form.days}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, days: Number(event.target.value) }))
                }
              />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(createdKey)}
        onClose={() => setCreatedKey(null)}
        title="密钥已创建"
        description="关闭后将无法再次查看完整密钥。"
        size="sm"
        footer={
          <Button variant="primary" onClick={() => setCreatedKey(null)}>
            我已保存
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-[11.5px] text-muted">{createdKey?.name}</p>
          <div className="break-all rounded-lg border border-line bg-black/30 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-accent-2">
            {createdKey?.key}
          </div>
          <CopyButton value={createdKey?.key || ''} />
        </div>
      </Modal>

      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title="撤销 API 密钥？"
        description="使用该密钥的集成将立即失效。"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>
              取消
            </Button>
            <Button variant="danger" loading={revoking} onClick={revoke}>
              撤销
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-muted">确认撤销「{revokeTarget?.name}」？</p>
      </Modal>
    </div>
  );
}
