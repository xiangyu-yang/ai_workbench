import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { knowledgeBases } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { audit } from '@/server/audit';
import {
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  embeddingProviderId: z.string().nullable().optional(),
  embeddingModel: z.string().max(160).default(''),
  chunkSize: z.number().int().min(300).max(2000).default(900),
  chunkOverlap: z.number().int().min(0).max(500).default(120),
});

export async function GET() {
  try {
    const auth = await requireApi('viewer');
    const db = await getDb();
    const rows = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.orgId, auth.org.id))
      .orderBy(asc(knowledgeBases.createdAt));
    return json({ knowledgeBases: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const input = Body.parse(await readJson(req));
    const db = await getDb();
    const id = newId('kb');
    await db.insert(knowledgeBases).values({
      id,
      orgId: auth.org.id,
      name: input.name,
      description: input.description,
      embeddingProviderId: input.embeddingProviderId || null,
      embeddingModel: input.embeddingModel,
      chunkSize: input.chunkSize,
      chunkOverlap: input.chunkOverlap,
      createdBy: auth.user.id,
    });
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'knowledge.create',
      { type: 'knowledge_base', id },
      { name: input.name },
    );
    return json({ ok: true, id }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
