import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { apiKeys } from '@/server/db/schema';
import { sha256 } from '@/server/security/crypto';
import { ApiError, rateLimit } from '@/server/http';

export type ApiKeyAuth = {
  orgId: string;
  keyId: string;
  scopes: string[];
  createdBy: string | null;
};

export async function requireApiKey(
  req: Request,
  scope: 'read' | 'write' = 'read',
): Promise<ApiKeyAuth> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(cw_[A-Za-z0-9_-]+)$/);
  if (!match) {
    throw new ApiError(401, '缺少有效的 API Key（Authorization: Bearer cw_xxx）', 'unauthenticated');
  }
  const hash = sha256(match[1]);
  const db = await getDb();
  const rows = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1);
  const key = rows[0];
  if (!key) throw new ApiError(401, 'API Key 无效或已撤销', 'invalid_key');
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) {
    throw new ApiError(401, 'API Key 已过期', 'expired_key');
  }
  if (!key.scopes.includes(scope)) {
    throw new ApiError(403, `API Key 缺少 ${scope} 权限`, 'insufficient_scope');
  }
  rateLimit(`apikey:${key.id}`, 120, 60_000);
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .catch(() => undefined);
  return { orgId: key.orgId, keyId: key.id, scopes: key.scopes, createdBy: key.createdBy };
}
