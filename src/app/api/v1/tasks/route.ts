import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { experts, orgs, tasks } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { requireApiKey } from '@/server/auth/api-key';
import { ApiError, errorResponse, json, readJson } from '@/server/http';
import { appendTaskEvent } from '@/server/tasks/events';
import { enqueueTask } from '@/server/tasks/runner';
import { assertQuota } from '@/server/usage';

const Body = z.object({
  title: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(20_000).default(''),
  expertId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const key = await requireApiKey(req, 'write');
    const input = Body.parse(await readJson(req));
    const db = await getDb();
    const orgRows = await db.select().from(orgs).where(eq(orgs.id, key.orgId)).limit(1);
    if (!orgRows[0]) throw new ApiError(404, '组织不存在');
    await assertQuota(key.orgId, orgRows[0].tokenQuotaMonthly);

    let expertId = input.expertId || null;
    if (expertId) {
      const owned = await db
        .select({ id: experts.id })
        .from(experts)
        .where(and(eq(experts.orgId, key.orgId), eq(experts.id, expertId)))
        .limit(1);
      if (!owned.length) throw new ApiError(400, '专家不存在或不属于当前组织');
    }
    if (!expertId) {
      const rows = await db
        .select({ id: experts.id })
        .from(experts)
        .where(eq(experts.orgId, key.orgId))
        .orderBy(asc(experts.createdAt))
        .limit(1);
      expertId = rows[0]?.id || null;
    }
    const id = newId('tsk');
    await db.insert(tasks).values({
      id,
      orgId: key.orgId,
      title: input.title,
      goal: input.goal || input.title,
      expertId,
      status: 'queued',
      mode: 'agent',
      createdBy: key.createdBy,
    });
    await appendTaskEvent(key.orgId, id, 'task.created', { source: 'api' });
    enqueueTask(id);
    return json({ ok: true, id, status: 'queued' }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
