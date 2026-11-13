'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  ClipboardList,
  Copy,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  MoreHorizontal,
  PanelRight,
  Paperclip,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { ExpertAvatar, Logo } from '@/components/brand';
import { Badge, Button, ErrorBox, Modal, Progress, Spinner } from '@/components/ui';
import { Markdown } from './markdown';
import { ToolCard } from './tool-card';
import { ArtifactPanel } from './artifact-panel';
import { useToast } from '@/components/toast';
import type {
  ApprovalInfo,
  ArtifactInfo,
  AttachmentInfo,
  ChatMessage,
  ChatPart,
  ExpertOption,
  SkillOption,
} from '@/lib/chat-types';
import { bytes, cn, modeLabel, relativeTime, truncate } from '@/lib/utils';

const MODES = [
  { id: 'ask', label: '问答', hint: '直接回答，可检索知识与网页' },
  { id: 'plan', label: '规划', hint: '只输出执行计划，确认后再执行' },
  { id: 'agent', label: '执行', hint: '自主调用工具，产出交付物' },
] as const;

const SUGGESTIONS = [
  {
    icon: FileText,
    title: '写一份季度复盘报告',
    prompt: '帮我写一份 Q4 增长复盘报告，包含关键数据、问题归因与下一步行动计划。',
    mode: 'agent',
  },
  {
    icon: ListChecks,
    title: '把会议纪要变成行动项',
    prompt: '把下面这段会议纪要整理成结构化的行动项表格，标注负责人与截止时间：\n\n',
    mode: 'agent',
  },
  {
    icon: ShieldCheck,
    title: '基于知识库回答问题',
    prompt: '根据组织知识库，说明差旅住宿标准与报销时效分别是多少？',
    mode: 'ask',
  },
  {
    icon: Wand2,
    title: '分析问题并给出方案',
    prompt: '分析近期客户支持工单中的高频问题，给出优先级排序与改进方案。',
    mode: 'agent',
  },
];

type Props = {
  threadId: string | null;
  initialTitle: string;
  initialMessages: ChatMessage[];
  initialArtifacts: ArtifactInfo[];
  initialApprovals: ApprovalInfo[];
  experts: ExpertOption[];
  skills: SkillOption[];
  initialExpertId: string | null;
  initialSkillIds: string[] | null;
  initialMode: string;
  demoMode: boolean;
  modelLabel: string;
  appLabel?: string;
  appId?: string;
};

export function ChatView({
  threadId: initialThreadId,
  initialTitle,
  initialMessages,
  initialArtifacts,
  initialApprovals,
  experts,
  skills,
  initialExpertId,
  initialSkillIds,
  initialMode,
  demoMode,
  modelLabel,
  appLabel,
  appId,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [artifacts, setArtifacts] = React.useState<ArtifactInfo[]>(initialArtifacts);
  const [activeArtifactId, setActiveArtifactId] = React.useState<string | null>(null);
  const [approvalRisks, setApprovalRisks] = React.useState<Record<string, string>>(
    Object.fromEntries(initialApprovals.map((item) => [item.id, item.risk])),
  );
  const [expertId, setExpertId] = React.useState<string | null>(
    initialExpertId || experts[0]?.id || null,
  );
  const [mode, setMode] = React.useState(initialMode || 'agent');
  const [skillIds, setSkillIds] = React.useState<string[] | null>(() =>
    initialSkillIds === null
      ? null
      : initialSkillIds.filter((id) => skills.some((skill) => skill.id === id)),
  );
  const [title, setTitle] = React.useState(initialTitle);
  const [streaming, setStreaming] = React.useState(
    initialMessages.some((m) => m.status === 'streaming'),
  );
  const [error, setError] = React.useState('');
  const [usage, setUsage] = React.useState<{ input: number; output: number; cost: number } | null>(
    null,
  );
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const threadIdRef = React.useRef(initialThreadId);
  const assistantRef = React.useRef<string | null>(
    [...initialMessages].reverse().find((m) => m.role === 'assistant')?.id || null,
  );
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const atBottomRef = React.useRef(true);
  const [atBottom, setAtBottom] = React.useState(true);
  const isNewThread = React.useRef(!initialThreadId);

  const activeArtifact = artifacts.find((item) => item.id === activeArtifactId) || null;
  const selectedExpert = experts.find((item) => item.id === expertId) || null;
  const changeExpert = (id: string) => {
    setExpertId(id);
    setSkillIds(null);
  };

  const scrollToBottom = React.useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  React.useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottomRef.current = nearBottom;
    setAtBottom(nearBottom);
  };

  const patchAssistant = (updater: (message: ChatMessage) => ChatMessage) => {
    const id = assistantRef.current;
    if (!id) return;
    setMessages((prev) => prev.map((message) => (message.id === id ? updater(message) : message)));
  };

  const appendDelta = (kind: 'text' | 'reasoning', delta: string) => {
    patchAssistant((message) => {
      const parts = [...message.parts];
      const last = parts[parts.length - 1];
      if (last && last.type === kind) {
        parts[parts.length - 1] = { ...last, text: last.text + delta };
      } else {
        parts.push({ type: kind, text: delta });
      }
      return { ...message, parts };
    });
  };

  const consume = React.useCallback(
    async (response: Response) => {
      if (!response.body) throw new Error('服务器未返回流式响应');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let eventName = 'message';
      let dataLines: string[] = [];

      const dispatch = (name: string, data: string) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(data) as Record<string, unknown>;
        } catch {
          return;
        }
        switch (name) {
          case 'meta': {
            const realId = String(payload.messageId);
            const tempId = assistantRef.current;
            if (tempId && tempId !== realId) {
              setMessages((prev) =>
                prev.map((message) => (message.id === tempId ? { ...message, id: realId } : message)),
              );
            }
            assistantRef.current = realId;
            if (!threadIdRef.current && payload.threadId) {
              threadIdRef.current = String(payload.threadId);
            }
            break;
          }
          case 'text':
            appendDelta('text', String(payload.delta || ''));
            break;
          case 'reasoning':
            appendDelta('reasoning', String(payload.delta || ''));
            break;
          case 'tool_start': {
            const id = String(payload.id);
            const name = String(payload.name);
            patchAssistant((message) => {
              if (message.parts.some((part) => part.type === 'tool' && part.id === id)) {
                return message;
              }
              return {
                ...message,
                parts: [
                  ...message.parts,
                  {
                    type: 'tool',
                    id,
                    name,
                    title: name.replace(/^mcp_\d+_/, '').replace(/_/g, ' '),
                    status: 'running',
                  },
                ],
              };
            });
            break;
          }
          case 'tool_result': {
            const id = String(payload.id);
            const status = String(payload.status) as 'ok' | 'error' | 'denied' | 'pending_approval';
            const running = payload.summary === '执行中…';
            patchAssistant((message) => {
              const parts = [...message.parts];
              const index = parts.findIndex((part) => part.type === 'tool' && part.id === id);
              const patch = {
                status: running ? ('running' as const) : status,
                summary: payload.summary ? String(payload.summary) : undefined,
                output: payload.output ? String(payload.output) : undefined,
                durationMs: payload.durationMs ? Number(payload.durationMs) : undefined,
                approvalId: payload.approvalId ? String(payload.approvalId) : undefined,
              };
              if (index >= 0) {
                parts[index] = { ...(parts[index] as Extract<ChatPart, { type: 'tool' }>), ...patch };
              } else {
                parts.push({
                  type: 'tool',
                  id,
                  name: String(payload.name),
                  ...patch,
                });
              }
              return { ...message, parts };
            });
            if (payload.approvalId) {
              setApprovalRisks((prev) => ({
                ...prev,
                [String(payload.approvalId)]: '该操作需要人工确认后才会执行。',
              }));
            }
            break;
          }
          case 'artifact': {
            const artifact = payload.artifact as ArtifactInfo;
            setArtifacts((prev) =>
              prev.some((item) => item.id === artifact.id) ? prev : [...prev, artifact],
            );
            patchAssistant((message) => ({
              ...message,
              parts: [
                ...message.parts,
                {
                  type: 'artifact',
                  artifactId: artifact.id,
                  name: artifact.name,
                  mime: artifact.mime,
                  size: artifact.size,
                  kind: artifact.kind,
                },
              ],
            }));
            setActiveArtifactId(artifact.id);
            break;
          }
          case 'citation': {
            const citation = payload.citation as Extract<ChatPart, { type: 'citation' }>;
            patchAssistant((message) => {
              if (
                message.parts.some(
                  (part) => part.type === 'citation' && part.index === citation.index,
                )
              ) {
                return message;
              }
              return { ...message, parts: [...message.parts, citation] };
            });
            break;
          }
          case 'approval': {
            const approval = payload.approval as {
              id: string;
              risk: string;
              toolName: string;
            };
            setApprovalRisks((prev) => ({ ...prev, [approval.id]: approval.risk }));
            break;
          }
          case 'parts': {
            const parts = payload.parts as ChatPart[];
            patchAssistant((message) => ({ ...message, parts }));
            break;
          }
          case 'usage': {
            setUsage({
              input: Number(payload.inputTokens || 0),
              output: Number(payload.outputTokens || 0),
              cost: Number(payload.costUsd || 0),
            });
            break;
          }
          case 'status': {
            const status = String(payload.status) as ChatMessage['status'];
            patchAssistant((message) => ({ ...message, status }));
            if (status !== 'streaming') setStreaming(false);
            break;
          }
          case 'error': {
            const message = String(payload.message || '执行失败');
            setError(message);
            setStreaming(false);
            break;
          }
          case 'done': {
            const status = String(payload.status) as ChatMessage['status'];
            const content = String(payload.content || '');
            patchAssistant((message) => ({
              ...message,
              status,
              content: content || message.content,
            }));
            setStreaming(false);
            if (isNewThread.current && threadIdRef.current) {
              isNewThread.current = false;
              router.replace(`/chat/${threadIdRef.current}${appId ? `?app=${appId}` : ''}`);
            } else {
              router.refresh();
            }
            break;
          }
          default:
            break;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline).replace(/\r$/, '');
          buffer = buffer.slice(newline + 1);
          if (line === '') {
            if (dataLines.length) dispatch(eventName, dataLines.join('\n'));
            eventName = 'message';
            dataLines = [];
          } else if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
      }
      if (dataLines.length) dispatch(eventName, dataLines.join('\n'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  const send = async (text: string, attachments: AttachmentInfo[] = [], overrideMode?: string) => {
    const clean = text.trim();
    if ((!clean && !attachments.length) || streaming) return;
    const activeMode = overrideMode || mode;
    setError('');
    setStreaming(true);
    atBottomRef.current = true;

    const userId = `tmp_u_${Date.now()}`;
    const tempAssistantId = `tmp_a_${Date.now()}`;
    assistantRef.current = tempAssistantId;
    const now = new Date().toISOString();

    const userParts: ChatPart[] = [];
    if (clean) userParts.push({ type: 'text', text: clean });
    for (const attachment of attachments) {
      userParts.push({
        type: 'attachment',
        attachmentId: attachment.id,
        name: attachment.name,
        mime: attachment.mime,
        size: attachment.size,
        kind: attachment.kind,
      });
    }

    setMessages((prev) => [
      ...prev,
      {
        id: userId,
        role: 'user',
        parts: userParts,
        content: clean,
        status: 'completed',
        createdAt: now,
      },
      {
        id: tempAssistantId,
        role: 'assistant',
        parts: [],
        content: '',
        status: 'streaming',
        createdAt: now,
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          threadId: threadIdRef.current || undefined,
          expertId,
          mode: activeMode,
          skillIds,
          text: clean,
          attachmentIds: attachments.map((item) => item.id),
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `请求失败（${response.status}）`);
      }
      await consume(response);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        patchAssistant((message) => ({ ...message, status: 'cancelled' }));
      } else {
        const message = (err as Error).message;
        setError(message);
        patchAssistant((msg) => ({
          ...msg,
          status: 'error',
          parts: [{ type: 'text', text: `执行失败：${message}` }],
        }));
        toast(message, { variant: 'error' });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setStreaming(false);
    toast('已停止生成');
  };

  const decideApproval = async (approvalId: string, decision: 'approved' | 'denied') => {
    patchAssistant((message) => ({
      ...message,
      parts: message.parts.map((part) =>
        part.type === 'tool' && part.approvalId === approvalId
          ? { ...part, status: decision === 'approved' ? 'running' : 'denied' }
          : part,
      ),
    }));
    try {
      const response = await fetch(`/api/approvals/${approvalId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = (await response.json()) as {
        error?: string;
        ready?: boolean;
        taskId?: string;
        messageId?: string;
      };
      if (!response.ok) throw new Error(data.error || '审批失败');
      toast(decision === 'approved' ? '已批准，继续执行' : '已拒绝该操作', {
        variant: decision === 'approved' ? 'success' : 'info',
      });
      if (data.ready && data.taskId) {
        router.refresh();
        return;
      }
      if (data.ready && data.messageId) {
        setStreaming(true);
        const controller = new AbortController();
        abortRef.current = controller;
        const resumeResponse = await fetch('/api/chat/resume', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messageId: data.messageId }),
          signal: controller.signal,
        });
        if (!resumeResponse.ok) {
          const payload = (await resumeResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || '恢复执行失败');
        }
        await consume(resumeResponse);
      }
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
      setStreaming(false);
    } finally {
      abortRef.current = null;
    }
  };

  const rename = async (next: string) => {
    const trimmed = next.trim();
    if (!threadIdRef.current || !trimmed || trimmed === title) return;
    setTitle(trimmed);
    try {
      await fetch(`/api/threads/${threadIdRef.current}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      router.refresh();
    } catch {
      toast('重命名失败', { variant: 'error' });
    }
  };

  const removeThread = async () => {
    if (!threadIdRef.current) return;
    setDeleting(true);
    try {
      const response = await fetch(`/api/threads/${threadIdRef.current}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('删除失败');
      toast('对话已删除');
      router.push('/chat');
      router.refresh();
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  const convertToTask = async () => {
    const lastUser = [...messages].reverse().find((message) => message.role === 'user');
    if (!lastUser) return;
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: truncate(lastUser.content.replace(/\s+/g, ' '), 60) || '来自对话的任务',
          goal: lastUser.content,
          expertId,
        }),
      });
      const data = (await response.json()) as { error?: string; id?: string };
      if (!response.ok) throw new Error(data.error || '创建失败');
      toast('已转为后台任务，可在任务中心跟踪进度');
      router.push('/tasks');
    } catch (err) {
      toast((err as Error).message, { variant: 'error' });
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          title={title}
          isNew={!initialThreadId}
          threadId={threadIdRef.current}
          onRename={rename}
          onDelete={() => setDeleteOpen(true)}
          onConvert={convertToTask}
          artifactCount={artifacts.length}
          onToggleArtifacts={() =>
            setActiveArtifactId(activeArtifactId ? null : artifacts[0]?.id || null)
          }
          artifactOpen={Boolean(activeArtifactId)}
          appLabel={appLabel}
          contextTurns={messages.filter((message) => message.role === 'user').length}
        />

        {messages.length === 0 ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
              <div className="flex min-h-full flex-col items-center justify-center px-5 py-8">
                <EmptyHero
                  onPick={(prompt, nextMode) => {
                    if (nextMode) setMode(nextMode);
                    void send(prompt, [], nextMode);
                  }}
                />
              </div>
            </div>
            <div className="shrink-0 border-t border-line/50 bg-canvas/80 px-5 pb-4 pt-3 backdrop-blur">
              <div className="mx-auto w-full max-w-[820px]">
                <Composer
                  experts={experts}
                  expertId={expertId}
                  onExpertChange={changeExpert}
                  skills={skills}
                  skillIds={skillIds}
                  onSkillsChange={setSkillIds}
                  mode={mode}
                  onModeChange={setMode}
                  streaming={streaming}
                  onSend={send}
                  onStop={stop}
                  demoMode={demoMode}
                  modelLabel={modelLabel}
                  placeholder="输入问题或目标；需要写入文件和调用工具时切换到执行…"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="relative min-h-0 flex-1 overflow-y-auto scrollbar-thin"
            >
              <div className="mx-auto w-full max-w-[820px] space-y-7 px-5 py-7">
                {messages.map((message) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    streaming={streaming && message.status === 'streaming'}
                    approvalRisks={approvalRisks}
                    onDecide={decideApproval}
                    onPreview={setActiveArtifactId}
                  />
                ))}
                {usage ? (
                  <div className="flex items-center justify-center gap-3 pb-2 text-[10.5px] text-faint">
                    <span>输入 {usage.input.toLocaleString()} tokens</span>
                    <span className="h-2.5 w-px bg-line" />
                    <span>输出 {usage.output.toLocaleString()} tokens</span>
                    {usage.cost > 0 ? (
                      <>
                        <span className="h-2.5 w-px bg-line" />
                        <span>约 ${usage.cost.toFixed(4)}</span>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {!atBottom ? (
                <button
                  type="button"
                  onClick={() => {
                    atBottomRef.current = true;
                    setAtBottom(true);
                    scrollToBottom(true);
                  }}
                  className="sticky bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-surface-2/95 px-3 py-1.5 text-[11px] text-muted shadow-xl backdrop-blur transition hover:text-ink"
                >
                  <ArrowDown size={12} /> 回到底部
                </button>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-line/50 bg-canvas/80 px-5 pb-4 pt-3 backdrop-blur">
              <div className="mx-auto w-full max-w-[820px]">
                {error ? (
                  <div className="mb-2">
                    <ErrorBox message={error} />
                  </div>
                ) : null}
                <Composer
                  experts={experts}
                  expertId={expertId}
                  onExpertChange={changeExpert}
                  skills={skills}
                  skillIds={skillIds}
                  onSkillsChange={setSkillIds}
                  mode={mode}
                  onModeChange={setMode}
                  streaming={streaming}
                  onSend={send}
                  onStop={stop}
                  demoMode={demoMode}
                  modelLabel={modelLabel}
                  placeholder="继续追问，或下达新的目标…"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {activeArtifact ? (
        <div className="hidden w-[430px] shrink-0 xl:block">
          <ArtifactPanel
            artifact={activeArtifact}
            artifacts={artifacts}
            onSelect={setActiveArtifactId}
            onClose={() => setActiveArtifactId(null)}
          />
        </div>
      ) : null}

      {activeArtifact ? (
        <div className="fixed inset-0 z-40 flex flex-col bg-surface xl:hidden">
          <ArtifactPanel
            artifact={activeArtifact}
            artifacts={artifacts}
            onSelect={setActiveArtifactId}
            onClose={() => setActiveArtifactId(null)}
          />
        </div>
      ) : null}

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除这段对话？"
        description="消息、交付物与运行记录将被一并删除，且不可恢复。"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              取消
            </Button>
            <Button variant="danger" loading={deleting} onClick={removeThread}>
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] text-muted">
          对话「{title}」中的 {messages.length} 条消息将被删除。
        </p>
      </Modal>
    </div>
  );
}

function ChatHeader({
  title,
  isNew,
  threadId,
  onRename,
  onDelete,
  onConvert,
  artifactCount,
  onToggleArtifacts,
  artifactOpen,
  appLabel,
  contextTurns,
}: {
  title: string;
  isNew: boolean;
  threadId: string | null;
  onRename: (value: string) => void;
  onDelete: () => void;
  onConvert: () => void;
  artifactCount: number;
  onToggleArtifacts: () => void;
  artifactOpen: boolean;
  appLabel?: string;
  contextTurns: number;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(title);

  React.useEffect(() => setDraft(title), [title]);

  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line/50 px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              setEditing(false);
              onRename(draft);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setEditing(false);
                onRename(draft);
              }
              if (event.key === 'Escape') {
                setEditing(false);
                setDraft(title);
              }
            }}
            className="h-7 w-[280px] rounded-md border border-accent/40 bg-surface-2 px-2 text-[13px] text-ink outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => threadId && setEditing(true)}
            className="group flex min-w-0 items-center gap-1.5 text-left"
            title={threadId ? '点击重命名' : undefined}
          >
            <span className="truncate text-[13.5px] font-medium text-ink">
              {isNew && !title ? '新对话' : title}
            </span>
            {threadId ? (
              <Pencil size={11} className="shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
            ) : null}
          </button>
        )}
        {appLabel ? (
          <Badge variant="outline" className="ml-1.5 hidden sm:inline-flex">
            <Sparkles size={9} /> {appLabel}
          </Badge>
        ) : null}
        {contextTurns > 1 ? (
          <span className="ml-1 hidden text-[10px] text-faint sm:inline">
          上下文 {contextTurns} 轮
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {artifactCount > 0 ? (
          <button
            type="button"
            onClick={onToggleArtifacts}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] transition',
              artifactOpen
                ? 'border-accent/30 bg-accent/10 text-accent-2'
                : 'border-line bg-surface-2 text-muted hover:text-ink',
            )}
          >
            <PanelRight size={13} />
            交付物
            <span className="rounded bg-surface-3 px-1 text-[10px]">{artifactCount}</span>
          </button>
        ) : null}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            disabled={!threadId}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-faint transition hover:bg-surface-3 hover:text-ink disabled:opacity-30"
            aria-label="更多操作"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-44 animate-fade-up overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditing(true);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-muted transition hover:bg-surface-3 hover:text-ink"
                >
                  <Pencil size={13} /> 重命名对话
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onConvert();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-muted transition hover:bg-surface-3 hover:text-ink"
                >
                  <ClipboardList size={13} /> 转为后台任务
                </button>
                <div className="my-1 h-px bg-line/70" />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] text-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={13} /> 删除对话
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function EmptyHero({ onPick }: { onPick: (prompt: string, mode?: string) => void }) {
  return (
    <div className="w-full max-w-[820px] animate-fade-up">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="relative mb-5">
          <div className="absolute inset-0 rounded-2xl bg-accent/25 blur-2xl" />
          <Logo size={54} className="relative" />
        </div>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-ink">
          今天，想让 Cuter <span className="text-gradient">完成什么？</span>
        </h1>
        <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-muted">
          描述目标即可。默认问答；需要写文件或调用工具时切换到「执行」，敏感操作会先请求审批。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((item) => (
          <button
            key={item.title}
            type="button"
            onClick={() => onPick(item.prompt, item.mode)}
            className="group flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-accent/25 hover:bg-accent/[0.04]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted transition group-hover:text-accent-2">
              <item.icon size={15} />
            </span>
            <span className="min-w-0">
              <span className="block text-[12.5px] font-medium text-ink">{item.title}</span>
              <span className="mt-0.5 line-clamp-2 block text-[11px] leading-relaxed text-faint">
                {truncate(item.prompt.replace(/\n/g, ' '), 64)}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageItem({
  message,
  streaming,
  approvalRisks,
  onDecide,
  onPreview,
}: {
  message: ChatMessage;
  streaming: boolean;
  approvalRisks: Record<string, string>;
  onDecide: (id: string, decision: 'approved' | 'denied') => void;
  onPreview: (id: string) => void;
}) {
  const [copied, setCopied] = React.useState(false);
  const citations = message.parts.filter(
    (part): part is Extract<ChatPart, { type: 'citation' }> => part.type === 'citation',
  );
  const reasoning = message.parts.filter(
    (part): part is Extract<ChatPart, { type: 'reasoning' }> => part.type === 'reasoning',
  );
  const hasVisibleContent = message.parts.some(
    (part) => part.type === 'text' || part.type === 'tool' || part.type === 'artifact',
  );

  if (message.role === 'user') {
    const text = message.parts
      .filter((part): part is Extract<ChatPart, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text)
      .join('');
    const attachments = message.parts.filter(
      (part): part is Extract<ChatPart, { type: 'attachment' }> => part.type === 'attachment',
    );
    return (
      <div className="flex animate-fade-up justify-end">
        <div className="max-w-[85%] space-y-2">
          {text ? (
            <div className="whitespace-pre-wrap rounded-2xl rounded-br-md border border-accent/20 bg-[linear-gradient(140deg,rgba(124,108,255,0.16),rgba(34,211,238,0.05))] px-4 py-2.5 text-[13.5px] leading-relaxed text-ink">
              {text}
            </div>
          ) : null}
          {attachments.length ? (
            <div className="flex flex-wrap justify-end gap-1.5">
              {attachments.map((attachment) =>
                attachment.kind === 'image' ? (
                  <a
                    key={attachment.attachmentId}
                    href={`/api/attachments/${attachment.attachmentId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative overflow-hidden rounded-lg border border-line"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/attachments/${attachment.attachmentId}`}
                      alt={attachment.name}
                      className="h-24 w-24 object-cover transition group-hover:scale-[1.02]"
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-[9px] text-white/80">
                      {attachment.name}
                    </span>
                  </a>
                ) : (
                  <span
                    key={attachment.attachmentId}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[10.5px] text-muted"
                  >
                    <FileText size={11} />
                    <span className="max-w-[160px] truncate">{attachment.name}</span>
                    <span className="text-faint">{bytes(attachment.size)}</span>
                  </span>
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="group animate-fade-up">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-surface-2">
          <Logo size={16} />
        </span>
        <span className="text-[11.5px] font-medium text-ink">Cuter</span>
        {message.model ? <span className="text-[10px] text-faint">{message.model}</span> : null}
        <span className="text-[10px] text-faint">{relativeTime(message.createdAt)}</span>
        {message.status === 'awaiting_approval' ? (
          <Badge variant="warning" dot>
            等待审批
          </Badge>
        ) : null}
        {message.status === 'cancelled' ? (
          <Badge variant="outline">已停止</Badge>
        ) : null}
        {message.status === 'error' ? (
          <Badge variant="danger" dot>
            执行失败
          </Badge>
        ) : null}
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(message.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* ignore */
            }
          }}
          className="ml-auto rounded p-1 text-faint opacity-0 transition hover:bg-surface-3 hover:text-ink group-hover:opacity-100"
          title="复制回答"
        >
          {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
        </button>
      </div>

      <div className="space-y-3 pl-0 sm:pl-8">
        {reasoning.length ? (
          <details className="group/reason overflow-hidden rounded-xl border border-line/80 bg-surface-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[11.5px] text-muted [&::-webkit-details-marker]:hidden">
              <Brain size={13} className={cn('text-accent-2', streaming && 'animate-pulse')} />
              思考过程
              <ChevronDown
                size={12}
                className="ml-auto transition group-open/reason:rotate-180"
              />
            </summary>
            <div className="whitespace-pre-wrap border-t border-line/60 px-3.5 py-3 text-[11.5px] leading-relaxed text-muted/90">
              {reasoning.map((part, index) => (
                <p key={index}>{part.text}</p>
              ))}
            </div>
          </details>
        ) : null}

        {message.parts.map((part, index) => {
          if (part.type === 'text') {
            return (
              <Markdown key={`text-${index}`} streaming={streaming && index === message.parts.length - 1}>
                {part.text}
              </Markdown>
            );
          }
          if (part.type === 'tool') {
            return (
              <ToolCard
                key={`tool-${part.id}`}
                part={part}
                approvalRisk={part.approvalId ? approvalRisks[part.approvalId] : undefined}
                onApprove={(id) => onDecide(id, 'approved')}
                onDeny={(id) => onDecide(id, 'denied')}
              />
            );
          }
          if (part.type === 'artifact') {
            return (
              <button
                key={`artifact-${part.artifactId}`}
                type="button"
                onClick={() => onPreview(part.artifactId)}
                className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2/70 p-3 text-left transition hover:border-accent/25 hover:bg-surface-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent-2">
                  <FileText size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-ink">
                    {part.name}
                  </span>
                  <span className="mt-0.5 block text-[10.5px] text-faint">
                    交付物 · {bytes(part.size)} · 点击预览
                  </span>
                </span>
                <span className="shrink-0 rounded-md border border-line px-2 py-1 text-[10.5px] text-muted">
                  预览
                </span>
              </button>
            );
          }
          return null;
        })}

        {streaming && !hasVisibleContent ? (
          <div className="flex items-center gap-2 py-1 text-[12px] text-muted">
            <Spinner size={13} />
            正在思考
            <span className="flex gap-1">
              <span className="h-1 w-1 animate-pulse rounded-full bg-accent" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
              <span className="h-1 w-1 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
            </span>
          </div>
        ) : null}

        {citations.length ? (
          <div className="rounded-xl border border-line/80 bg-surface-2 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-faint">
              <Sparkles size={11} /> 参考来源
            </p>
            <div className="flex flex-wrap gap-1.5">
              {citations.map((citation) => (
                <span
                  key={`${citation.index}-${citation.title}`}
                  title={citation.snippet}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-[10.5px] text-muted"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-accent/15 text-[9px] text-accent-2">
                    {citation.index}
                  </span>
                  <span className="max-w-[220px] truncate">{citation.title}</span>
                  {citation.score ? <span className="text-faint">{citation.score}%</span> : null}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Composer({
  experts,
  expertId,
  onExpertChange,
  skills,
  skillIds,
  onSkillsChange,
  mode,
  onModeChange,
  streaming,
  onSend,
  onStop,
  demoMode,
  modelLabel,
  placeholder,
}: {
  experts: ExpertOption[];
  expertId: string | null;
  onExpertChange: (id: string) => void;
  skills: SkillOption[];
  skillIds: string[] | null;
  onSkillsChange: (ids: string[] | null) => void;
  mode: string;
  onModeChange: (mode: string) => void;
  streaming: boolean;
  onSend: (text: string, attachments: AttachmentInfo[]) => void | Promise<void>;
  onStop: () => void;
  demoMode: boolean;
  modelLabel: string;
  placeholder: string;
}) {
  const { toast } = useToast();
  const [text, setText] = React.useState('');
  const [attachments, setAttachments] = React.useState<AttachmentInfo[]>([]);
  const [expertOpen, setExpertOpen] = React.useState(false);
  const [skillOpen, setSkillOpen] = React.useState(false);
  const [skillQuery, setSkillQuery] = React.useState('');
  const [dragOver, setDragOver] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const selected = experts.find((item) => item.id === expertId) || null;
  const selectedSkills = (skillIds || [])
    .map((id) => skills.find((skill) => skill.id === id))
    .filter((skill): skill is SkillOption => Boolean(skill));
  const visibleSkills = skills.filter(
    (skill) =>
      !skillQuery ||
      skill.name.toLowerCase().includes(skillQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(skillQuery.toLowerCase()),
  );
  const skillLabel =
    skillIds === null
      ? '技能 · 自动'
      : selectedSkills.length === 0
        ? '技能 · 不使用'
        : selectedSkills.length === 1
          ? `技能 · ${selectedSkills[0].name}`
          : `技能 · ${selectedSkills.length} 个`;
  const activeMode = MODES.find((item) => item.id === mode);
  const uploading = attachments.some((item) => item.uploading);

  React.useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);

  const uploadFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files).slice(0, 4)) {
      if (attachments.length >= 4) {
        toast('最多同时上传 4 个附件', { variant: 'error' });
        break;
      }
      const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setAttachments((prev) => [
        ...prev,
        {
          id: tempId,
          name: file.name,
          mime: file.type,
          size: file.size,
          kind: file.type.startsWith('image/') ? 'image' : 'file',
          uploading: true,
        },
      ]);
      try {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/uploads', { method: 'POST', body: form });
        const data = (await response.json()) as AttachmentInfo & { error?: string };
        if (!response.ok) throw new Error(data.error || '上传失败');
        setAttachments((prev) =>
          prev.map((item) =>
            item.id === tempId
              ? {
                  id: data.id,
                  name: data.name,
                  mime: data.mime,
                  size: data.size,
                  kind: data.kind,
                }
              : item,
          ),
        );
      } catch (err) {
        setAttachments((prev) => prev.filter((item) => item.id !== tempId));
        toast((err as Error).message, { variant: 'error' });
      }
    }
  };

  const submit = () => {
    if (streaming || uploading) return;
    const ready = attachments.filter((item) => !item.uploading);
    if (!text.trim() && !ready.length) return;
    onSend(text, ready);
    setText('');
    setAttachments([]);
    setTimeout(() => textareaRef.current?.focus(), 10);
  };

  return (
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
        'relative rounded-2xl border bg-surface p-2 transition-all',
        dragOver
          ? 'border-accent/60 ring-2 ring-accent/20'
          : 'border-line shadow-[0_18px_60px_-30px_rgba(0,0,0,0.9)] focus-within:border-line-strong',
      )}
    >
      {attachments.length ? (
        <div className="flex flex-wrap gap-1.5 px-1.5 pb-1.5 pt-1">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[10.5px] text-muted"
            >
              {attachment.uploading ? (
                <Loader2 size={11} className="animate-spin" />
              ) : attachment.kind === 'image' ? (
                <ImageIcon size={11} />
              ) : (
                <FileText size={11} />
              )}
              <span className="max-w-[170px] truncate">{attachment.name}</span>
              <button
                type="button"
                onClick={() =>
                  setAttachments((prev) => prev.filter((item) => item.id !== attachment.id))
                }
                className="rounded p-0.5 text-faint hover:text-danger"
                aria-label="移除附件"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-2.5 py-2 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-faint"
      />

      <div className="flex items-center gap-1.5 px-1 pb-0.5 pt-1">
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple
          accept="image/*,.pdf,.docx,.txt,.md,.csv,.json"
          onChange={(event) => {
            if (event.target.files?.length) void uploadFiles(event.target.files);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-faint transition hover:bg-surface-3 hover:text-ink"
          title="添加附件（图片 / PDF / DOCX / 文本）"
        >
          <Paperclip size={14} />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setExpertOpen((prev) => !prev)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-muted transition hover:bg-surface-3 hover:text-ink"
          >
            {selected ? (
              <ExpertAvatar icon={selected.icon} accent={selected.accent} size={18} />
            ) : (
              <Sparkles size={13} className="text-faint" />
            )}
            <span className="max-w-[110px] truncate">{selected?.name || '通用助手'}</span>
            <ChevronDown size={11} className="text-faint" />
          </button>
          {expertOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setExpertOpen(false)} />
              <div className="absolute bottom-full left-0 z-50 mb-2 w-[300px] animate-fade-up overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
                <p className="px-2.5 pb-1 pt-1.5 text-[10px] uppercase tracking-wider text-faint">
                  选择专家
                </p>
                <div className="max-h-[280px] overflow-y-auto">
                  {experts.map((expert) => (
                    <button
                      key={expert.id}
                      type="button"
                      onClick={() => {
                        onExpertChange(expert.id);
                        setExpertOpen(false);
                      }}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition',
                        expert.id === expertId ? 'bg-surface-3' : 'hover:bg-surface-3',
                      )}
                    >
                      <ExpertAvatar icon={expert.icon} accent={expert.accent} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-ink">{expert.name}</span>
                        <span className="mt-0.5 block truncate text-[10.5px] text-faint">
                          {expert.description || expert.category}
                        </span>
                      </span>
                      {expert.id === expertId ? (
                        <Check size={13} className="mt-0.5 shrink-0 text-accent-2" />
                      ) : null}
                    </button>
                  ))}
                </div>
                <Link
                  href="/experts"
                  className="mt-1 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] text-muted transition hover:bg-surface-3 hover:text-ink"
                >
                  <Plus size={12} /> 管理专家与技能
                </Link>
              </div>
            </>
          ) : null}
        </div>

        <div className="relative">
          <button
            type="button"
            disabled={mode === 'plan'}
            onClick={() => setSkillOpen((prev) => !prev)}
            title={mode === 'plan' ? '规划模式只输出计划，不使用技能工具' : '选择本轮使用的技能'}
            className={cn(
              'inline-flex h-8 max-w-[170px] items-center gap-1.5 rounded-lg px-2 text-[11.5px] text-muted transition hover:bg-surface-3 hover:text-ink',
              mode === 'plan' && 'cursor-not-allowed opacity-45',
            )}
          >
            <Wand2 size={13} className="shrink-0 text-faint" />
            <span className="truncate">{skillLabel}</span>
            <ChevronDown size={11} className="shrink-0 text-faint" />
          </button>
          {skillOpen && mode !== 'plan' ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setSkillOpen(false)} />
              <div className="absolute bottom-full left-0 z-50 mb-2 w-[330px] max-w-[calc(100vw-2rem)] animate-fade-up overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-2xl">
                <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
                  <p className="text-[10px] uppercase tracking-wider text-faint">选择技能</p>
                  <button
                    type="button"
                    onClick={() => onSkillsChange(null)}
                    className="text-[10px] text-accent-2 hover:underline"
                  >
                    恢复自动
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSkillsChange(null);
                    setSkillOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition',
                    skillIds === null ? 'bg-surface-3' : 'hover:bg-surface-3',
                  )}
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line">
                    {skillIds === null ? <Check size={10} className="text-accent-2" /> : null}
                  </span>
                  <span>
                    <span className="block text-[12px] font-medium text-ink">自动（跟随专家）</span>
                    <span className="mt-0.5 block text-[10.5px] text-faint">
                      使用该专家已绑定的技能，推荐日常使用
                    </span>
                  </span>
                </button>
                <div className="my-1 h-px bg-line" />
                <div className="relative px-2">
                  <Search size={12} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                  <input
                    value={skillQuery}
                    onChange={(event) => setSkillQuery(event.target.value)}
                    placeholder="搜索技能…"
                    className="h-8 w-full rounded-lg border border-line bg-surface-2 pl-7 pr-2 text-[11.5px] text-ink outline-none placeholder:text-faint focus:border-accent/40"
                  />
                </div>
                <div className="mt-1 max-h-[260px] overflow-y-auto scrollbar-thin">
                  {visibleSkills.map((skill) => {
                    const checked = (skillIds || []).includes(skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => {
                          const current = skillIds || [];
                          if (checked) {
                            const next = current.filter((id) => id !== skill.id);
                            onSkillsChange(next);
                          } else {
                            if (current.length >= 3) {
                              toast('最多同时选择 3 个技能', { variant: 'error' });
                              return;
                            }
                            onSkillsChange([...current, skill.id]);
                          }
                        }}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition',
                          checked ? 'bg-accent/[0.07]' : 'hover:bg-surface-3',
                        )}
                      >
                        <span className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          checked ? 'border-accent/50 bg-accent/15 text-accent-2' : 'border-line',
                        )}>
                          {checked ? <Check size={10} /> : null}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[12px] font-medium text-ink">{skill.name}</span>
                            <Badge variant="outline" className="shrink-0 scale-90">{skill.category}</Badge>
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-relaxed text-faint">
                            {skill.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  {!visibleSkills.length ? (
                    <p className="px-2.5 py-6 text-center text-[11px] text-faint">没有匹配的技能</p>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-line/60 px-2.5 py-1.5">
                  <span className="text-[10px] text-faint">手动选择会覆盖专家默认技能，最多 3 个</span>
                  {skillIds && skillIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onSkillsChange([])}
                      className="text-[10px] text-muted hover:text-danger"
                    >
                      清空
                    </button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="mx-0.5 h-4 w-px bg-line" />

        <div className="flex items-center gap-0.5 rounded-lg bg-surface-2 p-0.5">
          {MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              title={item.hint}
              onClick={() => onModeChange(item.id)}
              className={cn(
                'h-7 whitespace-nowrap rounded-md px-2.5 text-[10.5px] font-medium transition',
                mode === item.id
                  ? 'bg-surface-3 text-ink shadow-sm'
                  : 'text-faint hover:text-muted',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden whitespace-nowrap text-[10px] text-faint 2xl:block">
            Enter 发送 · Shift+Enter 换行
          </span>
          {streaming ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 text-[11px] text-muted transition hover:border-danger/30 hover:text-danger"
            >
              <Square size={11} fill="currentColor" />
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={(!text.trim() && !attachments.length) || uploading}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[linear-gradient(120deg,#9184ff,#7c6cff_45%,#22d3ee)] text-[#06070c] shadow-[0_6px_20px_-8px_rgba(124,108,255,0.9)] transition hover:brightness-110 disabled:opacity-35"
              aria-label="发送"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={16} strokeWidth={2.4} />}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-line/40 px-2.5 pb-1.5 pt-1 text-[10px] text-faint">
          <span className="text-muted">{activeMode?.hint}</span>
          <span>·</span>
          <span>
            {mode === 'plan'
              ? '技能与工具不参与规划'
              : skillIds === null
                ? '技能跟随专家'
                : selectedSkills.length
                  ? `手动技能 ${selectedSkills.length} 个 · 覆盖专家默认`
                  : '手动技能：不使用'}
          </span>
          {mode === 'plan' ? (
            <button
              type="button"
              onClick={() => onModeChange('agent')}
              className="shrink-0 text-accent-2 hover:underline"
            >
              切换到执行
            </button>
          ) : null}
          <span className="ml-auto hidden max-w-[180px] truncate text-faint sm:block">
            {demoMode ? '演示模型' : modelLabel || '默认模型'}
          </span>
        </div>
      </div>
    </div>
  );
}
