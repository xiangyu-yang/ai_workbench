import { getDb } from '@/server/db/client';
import { auditLogs } from '@/server/db/schema';
import { newId } from '@/server/ids';

export type AuditActor = { orgId: string; actorId?: string | null; ip?: string };

export async function audit(
  actor: AuditActor,
  action: string,
  target?: { type?: string; id?: string },
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(auditLogs).values({
      id: newId('aud'),
      orgId: actor.orgId,
      actorId: actor.actorId || null,
      action,
      targetType: target?.type || '',
      targetId: target?.id || '',
      metadata,
      ip: actor.ip || '',
    });
  } catch (err) {
    console.error('[cuter] 审计写入失败', action, err);
  }
}
