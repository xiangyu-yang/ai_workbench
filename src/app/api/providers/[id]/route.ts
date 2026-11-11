import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { modelProviders } from '@/server/db/schema';
import { encryptSecret } from '@/server/security/crypto';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

const ModelSchema = z.object({
  id: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  contextWindow: z.number().int().positive().optional(),
  maxOutput: z.number().int().positive().optional(),
  reasoning: z.boolean().optional(),
  vision: z.boolean().optional(),
  inputPrice: z.number().min(0).optional(),
  outputPrice: z.number().min(0).optional(),
});

const PatchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  kind: z.enum(['openai', 'anthropic', 'ollama', 'mock']).optional(),
  baseUrl: z.string().max(1000).optional(),
  apiKey: z.string().max(500).optional(),
  headers: z.record(z.string()).optional(),
  models: z.array(ModelSchema).max(60).optional(),
  defaultModel: z.string().max(160).optional(),
  embeddingModel: z.string().max(160).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

async function load(orgId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(modelProviders)
    .where(and(eq(modelProviders.orgId, orgId), eq(modelProviders.id, id)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, '模型供应商不存在');
  return rows[0];
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    await load(auth.org.id, id);
    const input = PatchBody.parse(await readJson(req));
    if (input.isDefault) {
      const db = await getDb();
      await db
        .update(modelProviders)
        .set({ isDefault: false })
        .where(eq(modelProviders.orgId, auth.org.id));
    }
    const db = await getDb();
    await db
      .update(modelProviders)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
        ...(input.apiKey !== undefined
          ? { apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : '' }
          : {}),
        ...(input.headers !== undefined ? { headers: input.headers } : {}),
        ...(input.models !== undefined ? { models: input.models } : {}),
        ...(input.defaultModel !== undefined ? { defaultModel: input.defaultModel } : {}),
        ...(input.embeddingModel !== undefined ? { embeddingModel: input.embeddingModel } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        updatedAt: new Date(),
      })
      .where(eq(modelProviders.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'provider.update',
      { type: 'model_provider', id },
      { name: input.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const row = await load(auth.org.id, id);
    const db = await getDb();
    await db.delete(modelProviders).where(eq(modelProviders.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'provider.delete',
      { type: 'model_provider', id },
      { name: row.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
