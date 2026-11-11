import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { orgs } from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

const Body = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  tokenQuotaMonthly: z.number().int().min(0).max(2_000_000_000).optional(),
  settings: z
    .object({
      allowSignup: z.boolean().optional(),
      defaultExpertId: z.string().nullable().optional(),
      retentionDays: z.number().int().min(1).max(3650).optional(),
    })
    .optional(),
});

export async function PATCH(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const input = Body.parse(await readJson(req));
    const db = await getDb();
    const rows = await db.select().from(orgs).where(eq(orgs.id, auth.org.id)).limit(1);
    const org = rows[0];
    if (!org) throw new ApiError(404, '组织不存在');
    await db
      .update(orgs)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.tokenQuotaMonthly !== undefined
          ? { tokenQuotaMonthly: input.tokenQuotaMonthly }
          : {}),
        ...(input.settings !== undefined
          ? { settings: { ...org.settings, ...input.settings } }
          : {}),
      })
      .where(eq(orgs.id, auth.org.id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'org.update',
      { type: 'org', id: auth.org.id },
      { name: input.name, quota: input.tokenQuotaMonthly },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
