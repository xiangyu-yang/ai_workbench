ALTER TABLE "threads" ADD COLUMN IF NOT EXISTS "skill_ids" jsonb;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "skill_ids" jsonb;
