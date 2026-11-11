CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '["read","write"]'::jsonb NOT NULL,
	"created_by" text,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"thread_id" text,
	"message_id" text,
	"task_id" text,
	"run_id" text,
	"tool_call_id" text DEFAULT '' NOT NULL,
	"tool_name" text NOT NULL,
	"tool_args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"risk" text DEFAULT '该操作会对外部系统产生影响' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"task_id" text,
	"thread_id" text,
	"message_id" text,
	"name" text NOT NULL,
	"mime" text DEFAULT 'text/markdown' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"thread_id" text,
	"message_id" text,
	"name" text NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"path" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'file' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text DEFAULT '' NOT NULL,
	"target_id" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"document_id" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"embedding" jsonb,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_tools" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"input_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"transport" text DEFAULT 'http' NOT NULL,
	"command" text DEFAULT '' NOT NULL,
	"args" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"env_enc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"headers_enc" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"tool_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"name" text NOT NULL,
	"mime" text DEFAULT 'text/plain' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"storage_path" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"char_count" integer DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expert_connectors" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"expert_id" text NOT NULL,
	"connector_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expert_knowledge_bases" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"expert_id" text NOT NULL,
	"knowledge_base_id" text NOT NULL,
	"top_k" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expert_skills" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"expert_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'spark' NOT NULL,
	"accent" text DEFAULT '#7c6cff' NOT NULL,
	"category" text DEFAULT '通用' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"provider_id" text,
	"model_id" text DEFAULT '' NOT NULL,
	"temperature" double precision DEFAULT 0.4 NOT NULL,
	"max_steps" integer DEFAULT 8 NOT NULL,
	"tool_policy" text DEFAULT 'dangerous' NOT NULL,
	"default_mode" text DEFAULT 'agent' NOT NULL,
	"visibility" text DEFAULT 'team' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"code" text NOT NULL,
	"invited_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_bases" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"embedding_provider_id" text,
	"embedding_model" text DEFAULT '' NOT NULL,
	"chunk_size" integer DEFAULT 900 NOT NULL,
	"chunk_overlap" integer DEFAULT 120 NOT NULL,
	"doc_count" integer DEFAULT 0 NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"thread_id" text NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"provider_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"run_id" text,
	"error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"base_url" text DEFAULT '' NOT NULL,
	"api_key_enc" text DEFAULT '' NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"models" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_model" text DEFAULT '' NOT NULL,
	"embedding_model" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan" text DEFAULT 'enterprise' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"token_quota_monthly" integer DEFAULT 5000000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"thread_id" text,
	"message_id" text,
	"task_id" text,
	"expert_id" text,
	"provider_id" text,
	"model" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"steps" integer DEFAULT 0 NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text NOT NULL,
	"ip" text,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'instruction' NOT NULL,
	"icon" text DEFAULT 'wand' NOT NULL,
	"category" text DEFAULT '通用' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"manifest" jsonb DEFAULT '{"tools":[]}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'team' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"task_id" text NOT NULL,
	"seq" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"task_id" text NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"goal" text DEFAULT '' NOT NULL,
	"expert_id" text,
	"thread_id" text,
	"mode" text DEFAULT 'agent' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"schedule" jsonb DEFAULT '{"enabled":false}'::jsonb NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text DEFAULT '' NOT NULL,
	"result_summary" text DEFAULT '' NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"expert_id" text,
	"title" text DEFAULT '新对话' NOT NULL,
	"mode" text DEFAULT 'agent' NOT NULL,
	"source" text DEFAULT 'chat' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_daily" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"day" text NOT NULL,
	"provider_id" text,
	"model" text DEFAULT '' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"avatar_color" text DEFAULT '#7c6cff' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_org_idx" ON "api_keys" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "artifacts_task_idx" ON "artifacts" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "artifacts_thread_idx" ON "artifacts" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "attachments_thread_idx" ON "attachments" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "audit_org_created_idx" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "chunks_kb_idx" ON "chunks" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE INDEX "chunks_doc_idx" ON "chunks" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_tools_uq" ON "connector_tools" USING btree ("connector_id","name");--> statement-breakpoint
CREATE INDEX "connectors_org_idx" ON "connectors" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "documents_kb_idx" ON "documents" USING btree ("knowledge_base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expert_connectors_uq" ON "expert_connectors" USING btree ("expert_id","connector_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expert_kb_uq" ON "expert_knowledge_bases" USING btree ("expert_id","knowledge_base_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expert_skills_uq" ON "expert_skills" USING btree ("expert_id","skill_id");--> statement-breakpoint
CREATE INDEX "experts_org_idx" ON "experts" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_code_uq" ON "invites" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invites_org_idx" ON "invites" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "knowledge_bases_org_idx" ON "knowledge_bases" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_uq" ON "memberships" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "messages_thread_idx" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "model_providers_org_idx" ON "model_providers" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orgs_slug_uq" ON "orgs" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "runs_org_created_idx" ON "runs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_thread_idx" ON "runs" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "runs_task_idx" ON "runs" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_uq" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skill_versions_uq" ON "skill_versions" USING btree ("skill_id","version");--> statement-breakpoint
CREATE INDEX "skills_org_idx" ON "skills" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_events_seq_uq" ON "task_events" USING btree ("task_id","seq");--> statement-breakpoint
CREATE INDEX "task_steps_task_idx" ON "task_steps" USING btree ("task_id","ordinal");--> statement-breakpoint
CREATE INDEX "tasks_org_status_idx" ON "tasks" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "tasks_next_run_idx" ON "tasks" USING btree ("next_run_at");--> statement-breakpoint
CREATE INDEX "threads_org_user_idx" ON "threads" USING btree ("org_id","user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "threads_expert_idx" ON "threads" USING btree ("expert_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_daily_uq" ON "usage_daily" USING btree ("org_id","day","model");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");