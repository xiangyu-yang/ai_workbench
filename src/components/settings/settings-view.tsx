'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  Building2,
  Check,
  Copy,
  KeyRound,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  CopyButton,
  Field,
  Input,
  Modal,
  Progress,
  Select,
  Switch,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { cn, formatNumber, relativeTime } from '@/lib/utils';
import type {
  SettingsApiKey,
  SettingsExpert,
  SettingsInvite,
  SettingsMember,
  SettingsOrg,
  SettingsProvider,
} from '@/lib/settings-types';
import { ProvidersPanel } from './providers-panel';
import { UsagePanel } from './usage-panel';
import { AuditPanel } from './audit-panel';
import { ApiKeysPanel } from './api-keys-panel';

type Tab = 'general' | 'members' | 'providers' | 'keys' | 'usage' | 'audit';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }>; admin?: boolean }> = [
  { id: 'general', label: '组织', icon: Building2 },
  { id: 'members', label: '成员', icon: Users, admin: true },
  { id: 'providers', label: '模型供应商', icon: Sparkles, admin: true },
  { id: 'keys', label: 'API 密钥', icon: KeyRound, admin: true },
  { id: 'usage', label: '用量与成本', icon: BarChart3 },
  { id: 'audit', label: '审计日志', icon: ScrollText, admin: true },
];

const ROLE_LABEL: Record<string, string> = {
  owner: '所有者',
  admin: '管理员',
  member: '成员',
  viewer: '只读',
};

export function SettingsView({
  isAdmin,
  initialTab,
  org,
  currentUser,
  members,
  invites,
  providers,
  apiKeys,
  experts,
}: {
  isAdmin: boolean;
  initialTab: string;
  org: SettingsOrg;
  currentUser: { id: string; role: string };
  members: SettingsMember[];
  invites: SettingsInvite[];
  providers: SettingsProvider[];
  apiKeys: SettingsApiKey[];
  experts: SettingsExpert[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = React.useState<Tab>(
    TABS.some((item) => item.id === initialTab) ? (initialTab as Tab) : 'general',
  );
  const [form, setForm] = React.useState({
    name: org.name,
    tokenQuotaMonthly: org.tokenQuotaMonthly,
    allowSignup: org.settings?.allowSignup ?? true,
    defaultExpertId: org.settings?.defaultExpertId || '',
  });
  const [saving, setSaving] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteUrl, setInviteUrl] = React.useState('');
  const [inviteForm, setInviteForm] = React.useState({ email: '', role: 'member', days: 7 });
  const [inviting, setInviting] = React.useState(false);
  const [removeMember, setRemoveMember] = React.useState<SettingsMember | null>(null);
  const [removing, setRemoving] = React.useState(false);

  const switchTab = (next: Tab) => {
    setTab(next);
    window.history.replaceState(null, '', `/settings?tab=${next}`);
  };

  const saveGeneral = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/org', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          tokenQuotaMonthly: form.tokenQuotaMonthly,
          settings: {
            allowSignup: form.allowSignup,
            defaultExpertId: form.defaultExpertId || null,
          },
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast('组织设置已保存', { variant: 'success' });
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const createInvite = async () => {
    if (!inviteForm.email.trim()) {
      toast('请填写受邀人邮箱', { variant: 'error' });
      return;
    }
    setInviting(true);
    try {
      const response = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: inviteForm.email,
          role: inviteForm.role,
          expiresInDays: inviteForm.days,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        invite?: { url: string };
      };
      if (!response.ok) throw new Error(data.error || '创建邀请失败');
      setInviteUrl(data.invite?.url || '');
      toast('邀请已创建，复制链接发送给成员', { variant: 'success' });
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (member: SettingsMember, role: string) => {
    try {
      const response = await fetch(`/api/members/${member.membershipId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '更新失败');
      toast('成员角色已更新');
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    }
  };

  const removeMemberSubmit = async () => {
    if (!removeMember) return;
    setRemoving(true);
    try {
      const response = await fetch(`/api/members/${removeMember.membershipId}`, {
        method: 'DELETE',
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '移除失败');
      toast('成员已移除');
      setRemoveMember(null);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setRemoving(false);
    }
  };

  const revokeInvite = async (id: string) => {
    try {
      const response = await fetch(`/api/invites/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('撤销失败');
      toast('邀请已撤销');
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    }
  };

  const visibleTabs = TABS.filter((item) => !item.admin || isAdmin);

  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-[1180px] px-6 py-8 lg:px-10">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
            <Settings2 size={12} className="text-accent-2" />
            Settings
          </div>
          <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">设置</h1>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            组织、成员、模型、密钥与治理。所有变更都会写入审计日志。
          </p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
          <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-4 lg:block lg:h-fit lg:space-y-0.5 lg:overflow-visible">
            {visibleTabs.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => switchTab(item.id)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] transition',
                  tab === item.id
                    ? 'bg-surface-3 text-ink'
                    : 'text-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0">
            {tab === 'general' ? (
              <div className="space-y-4">
                <div className="panel p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-[14px] font-medium text-ink">组织信息</h2>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        名称会出现在登录页、对话系统提示与审计记录中。
                      </p>
                    </div>
                    <Badge variant="accent">{org.plan === 'enterprise' ? '企业版' : org.plan}</Badge>
                  </div>
                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="组织名称">
                      <Input
                        value={form.name}
                        disabled={!isAdmin}
                        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      />
                    </Field>
                    <Field label="组织标识" hint="用于内部分析与路由">
                      <Input value={org.slug} disabled className="font-mono text-[12px]" />
                    </Field>
                    <Field label="月度 Token 配额" hint="0 表示不限制；超出后拒绝新请求">
                      <Input
                        type="number"
                        value={form.tokenQuotaMonthly}
                        disabled={!isAdmin}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            tokenQuotaMonthly: Number(event.target.value),
                          }))
                        }
                      />
                    </Field>
                    <Field label="新会话默认专家">
                      <Select
                        value={form.defaultExpertId}
                        disabled={!isAdmin}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, defaultExpertId: event.target.value }))
                        }
                      >
                        <option value="">跟随第一位专家</option>
                        {experts.map((expert) => (
                          <option key={expert.id} value={expert.id}>
                            {expert.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-4 flex items-center justify-between rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                    <div>
                      <p className="text-[12px] font-medium text-ink">允许自助注册</p>
                      <p className="text-[10.5px] text-faint">
                        关闭后，新用户必须通过成员邀请加入组织
                      </p>
                    </div>
                    <Switch
                      checked={form.allowSignup}
                      disabled={!isAdmin}
                      onChange={(value) => setForm((prev) => ({ ...prev, allowSignup: value }))}
                    />
                  </div>
                  {isAdmin ? (
                    <div className="mt-4 flex justify-end">
                      <Button variant="primary" loading={saving} onClick={saveGeneral}>
                        保存设置
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-4 text-[11px] text-faint">只有管理员可以修改组织设置。</p>
                  )}
                </div>

                <div className="panel p-5">
                  <h2 className="text-[14px] font-medium text-ink">合规与运行</h2>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <InfoRow label="组织 ID" value={org.id} mono />
                    <InfoRow label="数据隔离" value="按组织硬隔离，查询强制注入 org_id" />
                    <InfoRow label="密钥保护" value="AES-256-GCM 加密，前端仅回显掩码" />
                    <InfoRow label="审计" value="登录、资产变更、工具调用全量记录" />
                  </div>
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-success/20 bg-success/[0.04] px-3 py-2.5">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" />
                    <p className="text-[11px] leading-relaxed text-muted">
                      生产环境建议配置 OIDC 单点登录、对象存储与外部 Worker；详见仓库
                      <code className="mx-1 text-accent-2">docs/ARCHITECTURE.md</code>。
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'members' ? (
              <div className="space-y-4">
                <div className="panel overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <div>
                      <h2 className="text-[13px] font-medium text-ink">成员</h2>
                      <p className="text-[10.5px] text-faint">共 {members.length} 人</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setInviteUrl('');
                        setInviteOpen(true);
                      }}
                    >
                      <UserPlus size={12} /> 邀请成员
                    </Button>
                  </div>
                  <div className="divide-y divide-line/70">
                    {members.map((member) => (
                      <div key={member.membershipId} className="flex items-center gap-3 px-4 py-3">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white/90"
                          style={{
                            background: `linear-gradient(145deg, ${member.avatarColor}, ${member.avatarColor}88)`,
                          }}
                        >
                          {member.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-ink">
                            {member.name}
                            {member.userId === currentUser.id ? (
                              <span className="ml-1.5 text-[10px] text-faint">（你）</span>
                            ) : null}
                          </p>
                          <p className="truncate text-[10.5px] text-faint">
                            {member.email} ·{' '}
                            {member.lastLoginAt ? `最近登录 ${relativeTime(member.lastLoginAt)}` : '从未登录'}
                          </p>
                        </div>
                        {isAdmin && member.role !== 'owner' && member.userId !== currentUser.id ? (
                          <Select
                            value={member.role}
                            onChange={(event) => void changeRole(member, event.target.value)}
                            className="h-8 w-[110px] text-[11px]"
                          >
                            <option value="admin">管理员</option>
                            <option value="member">成员</option>
                            <option value="viewer">只读</option>
                            {currentUser.role === 'owner' ? <option value="owner">所有者</option> : null}
                          </Select>
                        ) : (
                          <Badge variant={member.role === 'owner' ? 'accent' : 'outline'}>
                            {ROLE_LABEL[member.role]}
                          </Badge>
                        )}
                        {isAdmin && member.role !== 'owner' && member.userId !== currentUser.id ? (
                          <button
                            type="button"
                            onClick={() => setRemoveMember(member)}
                            className="rounded p-1.5 text-faint transition hover:bg-danger/10 hover:text-danger"
                            aria-label="移除成员"
                          >
                            <Trash2 size={13} />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="panel overflow-hidden">
                  <div className="border-b border-line px-4 py-3">
                    <h2 className="text-[13px] font-medium text-ink">待接受的邀请</h2>
                    <p className="text-[10.5px] text-faint">邀请链接 7 天内有效，绑定邮箱</p>
                  </div>
                  {invites.length === 0 ? (
                    <p className="px-4 py-6 text-[11.5px] text-faint">暂无待处理邀请。</p>
                  ) : (
                    <div className="divide-y divide-line/70">
                      {invites.map((invite) => (
                        <div key={invite.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] text-ink">{invite.email}</p>
                            <p className="text-[10px] text-faint">
                              {ROLE_LABEL[invite.role] || invite.role} · 到期{' '}
                              {relativeTime(invite.expiresAt)}
                            </p>
                          </div>
                          <CopyButton value={invite.url} />
                          <button
                            type="button"
                            onClick={() => void revokeInvite(invite.id)}
                            className="rounded p-1.5 text-faint transition hover:bg-danger/10 hover:text-danger"
                            aria-label="撤销邀请"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {tab === 'providers' ? <ProvidersPanel providers={providers} /> : null}
            {tab === 'keys' ? <ApiKeysPanel keys={apiKeys} /> : null}
            {tab === 'usage' ? <UsagePanel quota={org.tokenQuotaMonthly} /> : null}
            {tab === 'audit' ? <AuditPanel /> : null}
          </div>
        </div>
      </div>

      <Modal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          setInviteUrl('');
        }}
        title={inviteUrl ? '邀请已创建' : '邀请成员'}
        description={
          inviteUrl
            ? '把链接发送给受邀人，对方需使用该邮箱完成注册。'
            : '邀请链接绑定邮箱，注册后自动加入组织并应用角色权限。'
        }
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setInviteOpen(false);
                setInviteUrl('');
              }}
            >
              关闭
            </Button>
            {!inviteUrl ? (
              <Button variant="primary" loading={inviting} onClick={createInvite}>
                生成邀请
              </Button>
            ) : null}
          </>
        }
      >
        {inviteUrl ? (
          <div className="space-y-3">
            <div className="break-all rounded-lg border border-line bg-black/30 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-accent-2">
              {inviteUrl}
            </div>
            <CopyButton value={inviteUrl} />
            <p className="text-[11px] text-faint">链接过期后需重新生成。</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label="邮箱" required>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(event) =>
                  setInviteForm((prev) => ({ ...prev, email: event.target.value }))
                }
                placeholder="colleague@company.com"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="角色">
                <Select
                  value={inviteForm.role}
                  onChange={(event) =>
                    setInviteForm((prev) => ({ ...prev, role: event.target.value }))
                  }
                >
                  <option value="member">成员</option>
                  <option value="viewer">只读</option>
                  <option value="admin">管理员</option>
                </Select>
              </Field>
              <Field label="有效期（天）">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={inviteForm.days}
                  onChange={(event) =>
                    setInviteForm((prev) => ({ ...prev, days: Number(event.target.value) }))
                  }
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(removeMember)}
        onClose={() => setRemoveMember(null)}
        title="移除成员？"
        description="该成员将立即失去组织访问权限，历史记录保留。"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveMember(null)}>
              取消
            </Button>
            <Button variant="danger" loading={removing} onClick={removeMemberSubmit}>
              移除
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-muted">
          确认移除「{removeMember?.name}」（{removeMember?.email}）？
        </p>
      </Modal>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-faint">{label}</p>
      <p className={cn('mt-1 text-[11.5px] text-muted', mono && 'font-mono text-[10.5px]')}>
        {value}
      </p>
    </div>
  );
}
