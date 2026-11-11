'use client';

import * as React from 'react';
import {
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Plug,
  Plus,
  RefreshCw,
  Server,
  ShieldAlert,
  Terminal,
  Trash2,
  Wrench,
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
  Select,
  Switch,
  Textarea,
} from '@/components/ui';
import { useToast } from '@/components/toast';
import { cn, relativeTime } from '@/lib/utils';

type ConnectorRow = {
  id: string;
  name: string;
  description: string;
  transport: string;
  command: string;
  args: string[];
  url: string;
  enabled: boolean;
  status: string;
  lastError: string;
  lastCheckedAt: string | null;
  toolCount: number;
  envKeys: string[];
  headerKeys: string[];
};

type ToolInfo = { name: string; description: string; inputSchema: Record<string, unknown> };

const TRANSPORT_LABEL: Record<string, string> = {
  http: 'Streamable HTTP',
  sse: 'SSE',
  stdio: '本地进程 (stdio)',
};

const EMPTY_FORM = {
  name: '',
  description: '',
  transport: 'http',
  command: '',
  args: '',
  url: '',
  env: '',
  headers: '',
};

export function ConnectorManager({
  connectors,
  isAdmin,
  allowStdio,
}: {
  connectors: ConnectorRow[];
  isAdmin: boolean;
  allowStdio: boolean;
}) {
  const { toast } = useToast();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ConnectorRow | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [testing, setTesting] = React.useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [tools, setTools] = React.useState<ToolInfo[]>([]);
  const [toolsLoading, setToolsLoading] = React.useState(false);
  const [toolsConnector, setToolsConnector] = React.useState<ConnectorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<ConnectorRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [expandedTool, setExpandedTool] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (connector: ConnectorRow) => {
    setEditing(connector);
    setForm({
      name: connector.name,
      description: connector.description,
      transport: connector.transport,
      command: connector.command,
      args: connector.args.join(' '),
      url: connector.url,
      env: '',
      headers: '',
    });
    setFormOpen(true);
  };

  const parseKeyValues = (text: string): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const index = trimmed.indexOf('=');
      if (index <= 0) continue;
      out[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
    }
    return out;
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast('请填写连接器名称', { variant: 'error' });
      return;
    }
    if (form.transport === 'stdio' && !form.command.trim()) {
      toast('stdio 连接器需要启动命令', { variant: 'error' });
      return;
    }
    if (form.transport !== 'stdio' && !/^https?:\/\//.test(form.url.trim())) {
      toast('请填写合法的 MCP 服务 URL', { variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const env = parseKeyValues(form.env);
      const headers = parseKeyValues(form.headers);
      const payload: Record<string, unknown> = {
        name: form.name,
        description: form.description,
        transport: form.transport,
        enabled: true,
      };
      if (form.transport === 'stdio') {
        payload.command = form.command;
        payload.args = form.args.split(/\s+/).filter(Boolean);
      } else {
        payload.url = form.url;
      }
      if (Object.keys(env).length) payload.env = env;
      if (Object.keys(headers).length) payload.headers = headers;

      const response = await fetch(
        editing ? `/api/connectors/${editing.id}` : '/api/connectors',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '保存失败');
      toast(editing ? '连接器已更新' : '连接器已创建，请测试连接', { variant: 'success' });
      setFormOpen(false);
      window.location.reload();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const test = async (connector: ConnectorRow) => {
    setTesting(connector.id);
    try {
      const response = await fetch(`/api/connectors/${connector.id}/test`, { method: 'POST' });
      const data = (await response.json()) as { error?: string; tools?: ToolInfo[] };
      if (!response.ok) throw new Error(data.error || '连接失败');
      toast(`连接成功，发现 ${data.tools?.length || 0} 个工具`, { variant: 'success' });
      setTools(data.tools || []);
      setToolsConnector(connector);
      setToolsOpen(true);
      setRefreshKey((prev) => prev + 1);
      window.location.reload();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setTesting(null);
    }
  };

  const openTools = async (connector: ConnectorRow) => {
    setToolsConnector(connector);
    setToolsOpen(true);
    setToolsLoading(true);
    setTools([]);
    try {
      const response = await fetch(`/api/connectors/${connector.id}/tools`);
      const data = (await response.json()) as { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>; error?: string };
      if (!response.ok) throw new Error(data.error || '加载失败');
      setTools(data.tools || []);
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setToolsLoading(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/connectors/${deleteTarget.id}`, { method: 'DELETE' });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || '删除失败');
      toast('连接器已删除');
      setDeleteTarget(null);
      window.location.reload();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-thin" key={refreshKey}>
      <div className="mx-auto max-w-[1240px] px-6 py-8 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-faint">
              <Plug size={12} className="text-accent-2" />
              Connectors
            </div>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.025em] text-ink">连接器</h1>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted">
              基于 MCP 接入企业系统。凭据加密存储，工具在专家绑定后按审批策略调用，全部动作可审计。
            </p>
          </div>
          {isAdmin ? (
            <Button variant="primary" onClick={openCreate}>
              <Plus size={14} /> 接入 MCP 服务
            </Button>
          ) : null}
        </div>

        <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3">
          <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-[11px] leading-relaxed text-muted">
            连接器凭据使用 AES-256-GCM 加密保存，前端仅显示键名。stdio 类型会在服务端派生进程，
            托管环境建议通过 <code className="text-accent-2">MCP_ALLOW_STDIO=false</code> 关闭。
          </p>
        </div>

        {connectors.length === 0 ? (
          <EmptyState
            className="mt-8"
            icon={<Plug size={18} />}
            title="还没有连接器"
            description="接入一个 MCP 服务，让专家可以查询数据、创建工单、发送消息或操作内部系统。"
            action={
              isAdmin ? (
                <Button variant="primary" onClick={openCreate}>
                  <Plus size={14} /> 接入第一个服务
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
            {connectors.map((connector) => (
              <div
                key={connector.id}
                className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                      connector.status === 'healthy'
                        ? 'border-success/25 bg-success/10 text-success'
                        : connector.status === 'error'
                          ? 'border-danger/25 bg-danger/10 text-danger'
                          : 'border-line bg-surface-2 text-muted',
                    )}
                  >
                    {connector.transport === 'stdio' ? <Terminal size={17} /> : <Server size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-[13.5px] font-semibold text-ink">
                        {connector.name}
                      </h3>
                      {connector.status === 'healthy' ? (
                        <CheckCircle2 size={12} className="shrink-0 text-success" />
                      ) : connector.status === 'error' ? (
                        <CircleDashed size={12} className="shrink-0 text-danger" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10.5px] text-faint">
                      {TRANSPORT_LABEL[connector.transport] || connector.transport} ·{' '}
                      {connector.toolCount} 个工具
                    </p>
                  </div>
                  <Badge variant={connector.enabled ? 'success' : 'outline'} className="scale-90">
                    {connector.enabled ? '已启用' : '已停用'}
                  </Badge>
                </div>

                <p className="mt-3 line-clamp-2 min-h-[34px] text-[11.8px] leading-relaxed text-muted">
                  {connector.description || connector.url || connector.command || '暂无描述'}
                </p>
                {connector.lastError ? (
                  <p className="mt-2 line-clamp-2 rounded-md border border-danger/20 bg-danger/[0.05] px-2 py-1.5 text-[10.5px] text-danger/90">
                    {connector.lastError}
                  </p>
                ) : null}

                <div className="mt-3 flex items-center gap-2 border-t border-line/70 pt-3 text-[10.5px] text-faint">
                  <span>{connector.lastCheckedAt ? `检查于 ${relativeTime(connector.lastCheckedAt)}` : '尚未检查'}</span>
                  <span className="ml-auto inline-flex items-center gap-1">
                    <Wrench size={10} /> {connector.envKeys.length + connector.headerKeys.length} 个凭据
                  </span>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    loading={testing === connector.id}
                    onClick={() => test(connector)}
                  >
                    <RefreshCw size={12} /> 测试连接
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => openTools(connector)}>
                    工具
                  </Button>
                  {isAdmin ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(connector)}>
                        编辑
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => setDeleteTarget(connector)}
                        aria-label="删除连接器"
                      >
                        <Trash2 size={12} />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Drawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? '编辑连接器' : '接入 MCP 服务'}
        description="支持 Streamable HTTP、SSE 与本地 stdio 三种传输。保存后可测试连接并拉取工具清单。"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
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
                placeholder="例如：Jira"
              />
            </Field>
            <Field label="传输方式">
              <Select
                value={form.transport}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, transport: event.target.value }))
                }
              >
                <option value="http">Streamable HTTP</option>
                <option value="sse">SSE</option>
                {allowStdio ? <option value="stdio">本地进程 (stdio)</option> : null}
              </Select>
            </Field>
          </div>
          <Field label="描述">
            <Textarea
              rows={2}
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="这个连接器能做什么？"
            />
          </Field>

          {form.transport === 'stdio' ? (
            <>
              <Field label="启动命令" required hint="例如 npx，服务端需已安装对应包">
                <Input
                  value={form.command}
                  onChange={(event) => setForm((prev) => ({ ...prev, command: event.target.value }))}
                  placeholder="npx"
                  className="font-mono text-[12px]"
                />
              </Field>
              <Field label="命令参数" hint="空格分隔">
                <Input
                  value={form.args}
                  onChange={(event) => setForm((prev) => ({ ...prev, args: event.target.value }))}
                  placeholder="-y @modelcontextprotocol/server-filesystem /data"
                  className="font-mono text-[12px]"
                />
              </Field>
            </>
          ) : (
            <Field label="服务 URL" required hint="例如 https://mcp.example.com/mcp">
              <Input
                value={form.url}
                onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                placeholder="https://mcp.example.com/mcp"
                className="font-mono text-[12px]"
              />
            </Field>
          )}

          <Field
            label="环境变量"
            hint="每行一个 KEY=VALUE；编辑时留空则保持原值。值会加密存储。"
          >
            <Textarea
              rows={3}
              value={form.env}
              onChange={(event) => setForm((prev) => ({ ...prev, env: event.target.value }))}
              placeholder={editing?.envKeys.length ? `已有：${editing.envKeys.join('、')}` : 'API_KEY=...'}
              className="font-mono text-[11.5px]"
              spellCheck={false}
            />
          </Field>
          <Field label="请求头" hint="每行一个 KEY=VALUE；用于 HTTP/SSE 鉴权">
            <Textarea
              rows={3}
              value={form.headers}
              onChange={(event) => setForm((prev) => ({ ...prev, headers: event.target.value }))}
              placeholder={editing?.headerKeys.length ? `已有：${editing.headerKeys.join('、')}` : 'Authorization=Bearer ...'}
              className="font-mono text-[11.5px]"
              spellCheck={false}
            />
          </Field>

          {editing ? null : (
            <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[11px] leading-relaxed text-faint">
              保存后点击「测试连接」，平台会初始化 MCP 会话并缓存工具清单。连接失败时会显示具体错误。
            </div>
          )}
        </div>
      </Drawer>

      <Modal
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        title={`${toolsConnector?.name || ''} · 工具清单`}
        description="这些工具会以 mcp__ 前缀注册给绑定的专家，调用前按审批策略处理。"
        size="lg"
      >
        {toolsLoading ? (
          <div className="py-10 text-center text-[12px] text-faint">加载中…</div>
        ) : tools.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[12px] text-faint">
            暂无工具。请先测试连接；若服务端未暴露工具，请检查 MCP 配置。
          </div>
        ) : (
          <div className="space-y-2">
            {tools.map((tool) => (
              <div key={tool.name} className="overflow-hidden rounded-lg border border-line">
                <button
                  type="button"
                  onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-surface-2"
                >
                  <Wrench size={12} className="text-cyan" />
                  <span className="font-mono text-[11.5px] text-ink">{tool.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[10.5px] text-faint">
                    {tool.description}
                  </span>
                  <ChevronDown
                    size={12}
                    className={cn(
                      'text-faint transition-transform',
                      expandedTool === tool.name && 'rotate-180',
                    )}
                  />
                </button>
                {expandedTool === tool.name ? (
                  <pre className="max-h-48 overflow-auto border-t border-line bg-black/30 p-3 font-mono text-[10.5px] leading-relaxed text-muted">
                    {JSON.stringify(tool.inputSchema, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="删除连接器？"
        description="绑定该连接器的专家将失去对应工具，历史审计记录保留。"
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
    </div>
  );
}
