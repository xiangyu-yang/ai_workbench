CREATE TABLE IF NOT EXISTS "skill_files" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "skill_id" text NOT NULL,
  "path" text NOT NULL,
  "kind" text DEFAULT 'other' NOT NULL,
  "mime" text DEFAULT 'text/plain' NOT NULL,
  "size" integer DEFAULT 0 NOT NULL,
  "encoding" text DEFAULT 'utf8' NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "skill_files_uq" ON "skill_files" ("skill_id", "path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "skill_files_org_idx" ON "skill_files" ("org_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "apps" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "category" text DEFAULT '内部应用' NOT NULL,
  "icon" text DEFAULT 'layout-grid' NOT NULL,
  "accent" text DEFAULT '#7c6cff' NOT NULL,
  "type" text DEFAULT 'internal' NOT NULL,
  "url" text DEFAULT '' NOT NULL,
  "expert_id" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "last_opened_at" timestamp with time zone,
  "created_by" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "apps_org_idx" ON "apps" ("org_id");
