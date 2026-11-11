import { z } from 'zod';
import type { SkillManifest } from '@/server/db/schema';
import { ApiError } from '@/server/http';

export const HttpToolSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-zA-Z0-9_-]+$/, '工具名仅允许字母、数字、下划线与短横线'),
  description: z.string().trim().min(1).max(500),
  parameters: z.record(z.unknown()),
  request: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z.string().trim().min(1).max(1000).startsWith('http', 'URL 需以 http(s) 开头'),
    headers: z.record(z.string()).optional(),
    body: z.string().max(20_000).optional(),
  }),
  timeoutMs: z.number().int().min(1000).max(60_000).optional(),
});

export const SkillManifestSchema = z.object({
  tools: z.array(HttpToolSchema).max(8).default([]),
  notes: z.string().max(2000).optional(),
});

export function parseManifest(input: unknown): SkillManifest {
  const parsed = SkillManifestSchema.parse(input ?? { tools: [] });
  const names = new Set<string>();
  for (const tool of parsed.tools) {
    if (names.has(tool.name)) throw new ApiError(422, `工具名重复：${tool.name}`);
    if (tool.name.startsWith('mcp_') || tool.name.startsWith('skill_')) {
      throw new ApiError(422, '工具名不能以 mcp_ 或 skill_ 开头');
    }
    names.add(tool.name);
  }
  return parsed;
}
