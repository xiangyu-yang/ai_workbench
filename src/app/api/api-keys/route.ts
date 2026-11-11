import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { apiKeys } from '@/server/db/schema';
import { newApiKey } from '@/server/security/crypto';
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
  name: z.string().trim().min(1).max(60),
  scopes: z.array(z.enum(['read', 'write'])).min(1).default(['read', 'write']),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export async function GET() {
  try {
    const auth = await requireApi('admin');
    const db = await getDb();
    const rows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.orgId, auth.org.id))
      .orderBy(desc(apiKeys.createdAt));
    return json({
      keys: rows.map((row) => ({
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        scopes: row.scopes,
        lastUsedAt: row.lastUsedAt,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const input = Body.parse(await readJson(req));
    const { key, prefix, hash } = newApiKey();
    const db = await getDb();
    const id = newId('key');
    await db.insert(apiKeys).values({
      id,
      orgId: auth.org.id,
      name: input.name,
      prefix,
      keyHash: hash,
      scopes: input.scopes,
      createdBy: auth.user.id,
      expiresAt: input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 3600 * 1000)
        : null,
    });
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'api_key.create',
      { type: 'api_key', id },
      { name: input.name, scopes: input.scopes },
    );
    return json({ ok: true, id, key, prefix, name: input.name }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
