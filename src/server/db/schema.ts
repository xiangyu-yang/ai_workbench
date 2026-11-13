import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/* ─────────────────────────── 共享类型 ─────────────────────────── */

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export type OrgSettings = {
  allowSignup?: boolean;
  defaultExpertId?: string | null;
  retentionDays?: number;
  brandName?: string;
};

export type ModelInfo = {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutput?: number;
  reasoning?: boolean;
  vision?: boolean;
  inputPrice?: number;
  outputPrice?: number;
};

export type ProviderKind = 'openai' | 'anthropic' | 'ollama' | 'mock';

export type ToolPart = {
  type: 'tool';
  id: string;
  name: string;
  title?: string;
  args?: unknown;
  status: 'running' | 'ok' | 'error' | 'pending_approval' | 'denied';
  summary?: string;
  output?: string;
  durationMs?: number;
  approvalId?: string;
};

export type TextPart = { type: 'text'; text: string };
export type ReasoningPart = { type: 'reasoning'; text: string; durationMs?: number };
export type CitationPart = {
  type: 'citation';
  index: number;
  title: string;
  source?: string;
  snippet: string;
  score?: number;
};
export type ArtifactPart = {
  type: 'artifact';
  artifactId: string;
  name: string;
  mime: string;
  size: number;
  kind: 'document' | 'data' | 'code' | 'image' | 'other';
  taskId?: string;
};
export type AttachmentPart = {
  type: 'attachment';
  attachmentId: string;
  name: string;
  mime: string;
  size: number;
  kind: 'image' | 'file';
};

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolPart
  | CitationPart
  | ArtifactPart
  | AttachmentPart;

export type MessageStatus =
  | 'streaming'
  | 'completed'
  | 'error'
  | 'awaiting_approval'
  | 'cancelled';

export type ToolPolicy = 'never' | 'dangerous' | 'always';

export type TaskSchedule = {
  enabled: boolean;
  cron?: string;
  timezone?: string;
  tzOffsetMinutes?: number;
  nextRunAt?: string | null;
};

export type HttpToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  request: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: string;
  };
  timeoutMs?: number;
};

export type SkillFileKind = 'skill' | 'reference' | 'script' | 'asset' | 'other';

export type SkillPackageFile = {
  path: string;
  kind: SkillFileKind;
  mime: string;
  size: number;
  encoding: 'utf8' | 'base64';
  content: string;
  updatedAt?: string;
};

export type SkillFrontmatter = {
  name?: string;
  description?: string;
  version?: string;
  license?: string;
  compatibility?: string;
  allowedTools?: string[];
  metadata?: Record<string, string>;
};

export type SkillManifest = {
  tools: HttpToolDef[];
  notes?: string;
  frontmatter?: SkillFrontmatter;
  entry?: string;
  fileCount?: number;
  packageSize?: number;
};

export type AppType = 'internal' | 'external';

export type JsonSchema = Record<string, unknown>;

/* ─────────────────────────── 组织与身份 ─────────────────────────── */

export const orgs = pgTable(
  'orgs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: text('plan').notNull().default('enterprise'),
    settings: jsonb('settings').$type<OrgSettings>().notNull().default({}),
    tokenQuotaMonthly: integer('token_quota_monthly').notNull().default(5_000_000),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('orgs_slug_uq').on(t.slug)],
);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    avatarColor: text('avatar_color').notNull().default('#7c6cff'),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').$type<Role>().notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('memberships_org_user_uq').on(t.orgId, t.userId),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull(),
    userId: text('user_id').notNull(),
    orgId: text('org_id').notNull(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

export const invites = pgTable(
  'invites',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    email: text('email').notNull(),
    role: text('role').$type<Role>().notNull().default('member'),
    code: text('code').notNull(),
    invitedBy: text('invited_by').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: text('accepted_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('invites_code_uq').on(t.code), index('invites_org_idx').on(t.orgId)],
);

/* ─────────────────────────── 模型供应商 ─────────────────────────── */

export const modelProviders = pgTable(
  'model_providers',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').$type<ProviderKind>().notNull(),
    baseUrl: text('base_url').notNull().default(''),
    apiKeyEnc: text('api_key_enc').notNull().default(''),
    headers: jsonb('headers').$type<Record<string, string>>().notNull().default({}),
    models: jsonb('models').$type<ModelInfo[]>().notNull().default([]),
    defaultModel: text('default_model').notNull().default(''),
    embeddingModel: text('embedding_model').notNull().default(''),
    enabled: boolean('enabled').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('model_providers_org_idx').on(t.orgId)],
);

/* ─────────────────────────── 专家 ─────────────────────────── */

export const experts = pgTable(
  'experts',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    icon: text('icon').notNull().default('spark'),
    accent: text('accent').notNull().default('#7c6cff'),
    category: text('category').notNull().default('通用'),
    systemPrompt: text('system_prompt').notNull().default(''),
    providerId: text('provider_id'),
    modelId: text('model_id').notNull().default(''),
    temperature: doublePrecision('temperature').notNull().default(0.4),
    maxSteps: integer('max_steps').notNull().default(8),
    toolPolicy: text('tool_policy').$type<ToolPolicy>().notNull().default('dangerous'),
    defaultMode: text('default_mode').notNull().default('agent'),
    visibility: text('visibility').notNull().default('team'),
    version: integer('version').notNull().default(1),
    usageCount: integer('usage_count').notNull().default(0),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('experts_org_idx').on(t.orgId)],
);

export const expertSkills = pgTable(
  'expert_skills',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    expertId: text('expert_id').notNull(),
    skillId: text('skill_id').notNull(),
    version: integer('version').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('expert_skills_uq').on(t.expertId, t.skillId)],
);

export const expertKnowledgeBases = pgTable(
  'expert_knowledge_bases',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    expertId: text('expert_id').notNull(),
    knowledgeBaseId: text('knowledge_base_id').notNull(),
    topK: integer('top_k').notNull().default(6),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('expert_kb_uq').on(t.expertId, t.knowledgeBaseId)],
);

export const expertConnectors = pgTable(
  'expert_connectors',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    expertId: text('expert_id').notNull(),
    connectorId: text('connector_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('expert_connectors_uq').on(t.expertId, t.connectorId)],
);

/* ─────────────────────────── 技能 ─────────────────────────── */

export const skills = pgTable(
  'skills',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    type: text('type').notNull().default('instruction'),
    icon: text('icon').notNull().default('wand'),
    category: text('category').notNull().default('通用'),
    instructions: text('instructions').notNull().default(''),
    manifest: jsonb('manifest').$type<SkillManifest>().notNull().default({ tools: [] }),
    version: integer('version').notNull().default(1),
    status: text('status').notNull().default('draft'),
    visibility: text('visibility').notNull().default('team'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('skills_org_idx').on(t.orgId)],
);

export const skillVersions = pgTable(
  'skill_versions',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    skillId: text('skill_id').notNull(),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('skill_versions_uq').on(t.skillId, t.version)],
);

export const skillFiles = pgTable(
  'skill_files',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    skillId: text('skill_id').notNull(),
    path: text('path').notNull(),
    kind: text('kind').$type<SkillFileKind>().notNull().default('other'),
    mime: text('mime').notNull().default('text/plain'),
    size: integer('size').notNull().default(0),
    encoding: text('encoding').$type<'utf8' | 'base64'>().notNull().default('utf8'),
    content: text('content').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('skill_files_uq').on(t.skillId, t.path),
    index('skill_files_org_idx').on(t.orgId),
  ],
);

/* ─────────────────────────── 应用中心 ─────────────────────────── */

export const apps = pgTable(
  'apps',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default('内部应用'),
    icon: text('icon').notNull().default('layout-grid'),
    accent: text('accent').notNull().default('#7c6cff'),
    type: text('type').$type<AppType>().notNull().default('internal'),
    url: text('url').notNull().default(''),
    expertId: text('expert_id'),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('apps_org_idx').on(t.orgId)],
);

/* ─────────────────────────── 连接器（MCP） ─────────────────────────── */

export const connectors = pgTable(
  'connectors',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    transport: text('transport').notNull().default('http'),
    command: text('command').notNull().default(''),
    args: jsonb('args').$type<string[]>().notNull().default([]),
    envEnc: jsonb('env_enc').$type<Record<string, string>>().notNull().default({}),
    url: text('url').notNull().default(''),
    headersEnc: jsonb('headers_enc').$type<Record<string, string>>().notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    status: text('status').notNull().default('unknown'),
    lastError: text('last_error').notNull().default(''),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    toolCount: integer('tool_count').notNull().default(0),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('connectors_org_idx').on(t.orgId)],
);

export const connectorTools = pgTable(
  'connector_tools',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    connectorId: text('connector_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    inputSchema: jsonb('input_schema').$type<JsonSchema>().notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('connector_tools_uq').on(t.connectorId, t.name)],
);

/* ─────────────────────────── 知识库 ─────────────────────────── */

export const knowledgeBases = pgTable(
  'knowledge_bases',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    embeddingProviderId: text('embedding_provider_id'),
    embeddingModel: text('embedding_model').notNull().default(''),
    chunkSize: integer('chunk_size').notNull().default(900),
    chunkOverlap: integer('chunk_overlap').notNull().default(120),
    docCount: integer('doc_count').notNull().default(0),
    chunkCount: integer('chunk_count').notNull().default(0),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('knowledge_bases_org_idx').on(t.orgId)],
);

export const documents = pgTable(
  'documents',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    knowledgeBaseId: text('knowledge_base_id').notNull(),
    name: text('name').notNull(),
    mime: text('mime').notNull().default('text/plain'),
    size: integer('size').notNull().default(0),
    storagePath: text('storage_path').notNull().default(''),
    status: text('status').notNull().default('pending'),
    error: text('error').notNull().default(''),
    charCount: integer('char_count').notNull().default(0),
    chunkCount: integer('chunk_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('documents_kb_idx').on(t.knowledgeBaseId)],
);

export const chunks = pgTable(
  'chunks',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    knowledgeBaseId: text('knowledge_base_id').notNull(),
    documentId: text('document_id').notNull(),
    ordinal: integer('ordinal').notNull().default(0),
    content: text('content').notNull(),
    embedding: jsonb('embedding').$type<number[]>(),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('chunks_kb_idx').on(t.knowledgeBaseId),
    index('chunks_doc_idx').on(t.documentId),
  ],
);

/* ─────────────────────────── 对话 ─────────────────────────── */

export const threads = pgTable(
  'threads',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    userId: text('user_id').notNull(),
    expertId: text('expert_id'),
    title: text('title').notNull().default('新对话'),
    mode: text('mode').notNull().default('agent'),
    skillIds: jsonb('skill_ids').$type<string[] | null>(),
    source: text('source').notNull().default('chat'),
    pinned: boolean('pinned').notNull().default(false),
    archived: boolean('archived').notNull().default(false),
    summary: text('summary').notNull().default(''),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('threads_org_user_idx').on(t.orgId, t.userId, t.lastMessageAt),
    index('threads_expert_idx').on(t.expertId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    threadId: text('thread_id').notNull(),
    role: text('role').$type<'user' | 'assistant' | 'system'>().notNull(),
    parts: jsonb('parts').$type<MessagePart[]>().notNull().default([]),
    content: text('content').notNull().default(''),
    status: text('status').$type<MessageStatus>().notNull().default('completed'),
    model: text('model').notNull().default(''),
    providerId: text('provider_id'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    runId: text('run_id'),
    error: text('error').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_thread_idx').on(t.threadId, t.createdAt)],
);

export const attachments = pgTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    threadId: text('thread_id'),
    messageId: text('message_id'),
    name: text('name').notNull(),
    mime: text('mime').notNull().default('application/octet-stream'),
    size: integer('size').notNull().default(0),
    path: text('path').notNull().default(''),
    kind: text('kind').$type<'image' | 'file'>().notNull().default('file'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attachments_thread_idx').on(t.threadId)],
);

export const runs = pgTable(
  'runs',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    threadId: text('thread_id'),
    messageId: text('message_id'),
    taskId: text('task_id'),
    expertId: text('expert_id'),
    providerId: text('provider_id'),
    model: text('model').notNull().default(''),
    status: text('status').notNull().default('running'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    steps: integer('steps').notNull().default(0),
    error: text('error').notNull().default(''),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('runs_org_created_idx').on(t.orgId, t.createdAt),
    index('runs_thread_idx').on(t.threadId),
    index('runs_task_idx').on(t.taskId),
  ],
);

/* ─────────────────────────── 任务 ─────────────────────────── */

export const tasks = pgTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    title: text('title').notNull(),
    goal: text('goal').notNull().default(''),
    expertId: text('expert_id'),
    threadId: text('thread_id'),
    mode: text('mode').notNull().default('agent'),
    skillIds: jsonb('skill_ids').$type<string[] | null>(),
    status: text('status').notNull().default('queued'),
    progress: integer('progress').notNull().default(0),
    schedule: jsonb('schedule').$type<TaskSchedule>().notNull().default({ enabled: false }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    runCount: integer('run_count').notNull().default(0),
    createdBy: text('created_by'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error').notNull().default(''),
    resultSummary: text('result_summary').notNull().default(''),
    lockedBy: text('locked_by'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('tasks_org_status_idx').on(t.orgId, t.status),
    index('tasks_next_run_idx').on(t.nextRunAt),
  ],
);

export const taskSteps = pgTable(
  'task_steps',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    taskId: text('task_id').notNull(),
    ordinal: integer('ordinal').notNull().default(0),
    title: text('title').notNull(),
    status: text('status').notNull().default('pending'),
    detail: text('detail').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('task_steps_task_idx').on(t.taskId, t.ordinal)],
);

export const taskEvents = pgTable(
  'task_events',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    taskId: text('task_id').notNull(),
    seq: integer('seq').notNull().default(0),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('task_events_seq_uq').on(t.taskId, t.seq)],
);

export const artifacts = pgTable(
  'artifacts',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    taskId: text('task_id'),
    threadId: text('thread_id'),
    messageId: text('message_id'),
    name: text('name').notNull(),
    mime: text('mime').notNull().default('text/markdown'),
    size: integer('size').notNull().default(0),
    path: text('path').notNull().default(''),
    kind: text('kind').$type<'document' | 'data' | 'code' | 'image' | 'other'>().notNull().default('other'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('artifacts_task_idx').on(t.taskId), index('artifacts_thread_idx').on(t.threadId)],
);

export const approvals = pgTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    threadId: text('thread_id'),
    messageId: text('message_id'),
    taskId: text('task_id'),
    runId: text('run_id'),
    toolCallId: text('tool_call_id').notNull().default(''),
    toolName: text('tool_name').notNull(),
    toolArgs: jsonb('tool_args').$type<Record<string, unknown>>().notNull().default({}),
    risk: text('risk').notNull().default('该操作会对外部系统产生影响'),
    status: text('status').notNull().default('pending'),
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('approvals_status_idx').on(t.orgId, t.status)],
);

/* ─────────────────────────── 治理 ─────────────────────────── */

export const apiKeys = pgTable(
  'api_keys',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    name: text('name').notNull(),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: jsonb('scopes').$type<string[]>().notNull().default(['read', 'write']),
    createdBy: text('created_by'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('api_keys_hash_uq').on(t.keyHash), index('api_keys_org_idx').on(t.orgId)],
);

export const usageDaily = pgTable(
  'usage_daily',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    day: text('day').notNull(),
    providerId: text('provider_id'),
    model: text('model').notNull().default(''),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    runs: integer('runs').notNull().default(0),
    costUsd: doublePrecision('cost_usd').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('usage_daily_uq').on(t.orgId, t.day, t.model)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    targetType: text('target_type').notNull().default(''),
    targetId: text('target_id').notNull().default(''),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_org_created_idx').on(t.orgId, t.createdAt)],
);

/* ─────────────────────────── 推断类型 ─────────────────────────── */

export type Org = typeof orgs.$inferSelect;
export type User = typeof users.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type ModelProvider = typeof modelProviders.$inferSelect;
export type Expert = typeof experts.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type SkillFile = typeof skillFiles.$inferSelect;
export type App = typeof apps.$inferSelect;
export type Connector = typeof connectors.$inferSelect;
export type ConnectorTool = typeof connectorTools.$inferSelect;
export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type Chunk = typeof chunks.$inferSelect;
export type Thread = typeof threads.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type TaskStep = typeof taskSteps.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type UsageDaily = typeof usageDaily.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
