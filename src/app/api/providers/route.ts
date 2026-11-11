import { asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { modelProviders } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { encryptSecret } from '@/server/security/crypto';
import { safeProviders } from '@/server/llm/gateway';
import { audit } from '@/server/audit';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';

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

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['openai', 'anthropic', 'ollama', 'mock']).default('openai'),
  baseUrl: z.string().max(1000).default(''),
  apiKey: z.string().max(500).optional(),
  headers: z.record(z.string()).optional(),
  models: z.array(ModelSchema).max(60).default([]),
  defaultModel: z.string().max(160).default(''),
  embeddingModel: z.string().max(160).default(''),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export async function GET() {
  try {
    const auth = await requireApi('viewer');
    const db = await getDb();
    const rows = await db
      .select()
      .from(modelProviders)
      .where(eq(modelProviders.orgId, auth.org.id))
      .orderBy(desc(modelProviders.isDefault), asc(modelProviders.createdAt));
    return json({ providers: safeProviders(rows) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const input = Body.parse(await readJson(req));
    if (input.kind !== 'mock' && !input.baseUrl) {
      throw new ApiError(422, '请填写 Base URL');
    }
    const db = await getDb();
    const id = newId('prv');
    if (input.isDefault) {
      await db
        .update(modelProviders)
        .set({ isDefault: false })
        .where(eq(modelProviders.orgId, auth.org.id));
    }
    await db.insert(modelProviders).values({
      id,
      orgId: auth.org.id,
      name: input.name,
      kind: input.kind,
      baseUrl: input.baseUrl,
      apiKeyEnc: input.apiKey ? encryptSecret(input.apiKey) : '',
      headers: input.headers || {},
      models: input.models,
      defaultModel: input.defaultModel || input.models[0]?.id || '',
      embeddingModel: input.embeddingModel,
      enabled: input.enabled,
      isDefault: input.isDefault,
    });
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'provider.create',
      { type: 'model_provider', id },
      { name: input.name, kind: input.kind },
    );
    return json({ ok: true, id }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
