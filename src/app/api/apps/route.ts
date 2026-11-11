import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { apps, experts } from '@/server/db/schema';
import { newId } from '@/server/ids';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

const HttpUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }, '请输入 http(s) 地址');

const AppBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  category: z.string().trim().max(40).default('内部应用'),
  icon: z.string().max(40).default('layout-grid'),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色格式应为 #RRGGBB').default('#7c6cff'),
  type: z.enum(['internal', 'external']),
  url: z.string().trim().max(1000).default(''),
  expertId: z.string().max(80).optional().nullable(),
  enabled: z.boolean().default(true),
  sortOrder: z.number().int().min(-1000).max(1000).default(0),
});

async function assertExpert(orgId: string, expertId: string | null | undefined) {
  if (!expertId) return;
  const db = await getDb();
  const rows = await db
    .select({ id: experts.id })
    .from(experts)
    .where(and(eq(experts.orgId, orgId), eq(experts.id, expertId)))
    .limit(1);
  if (!rows[0]) throw new ApiError(422, '绑定的专家不存在或不属于当前组织');
}

export async function GET() {
  try {
    const auth = await requireApi('viewer');
    const db = await getDb();
    const rows = await db
      .select({ app: apps, expertName: experts.name })
      .from(apps)
      .leftJoin(experts, eq(experts.id, apps.expertId))
      .where(eq(apps.orgId, auth.org.id))
      .orderBy(sql`${apps.lastOpenedAt} desc nulls last`, asc(apps.sortOrder), asc(apps.createdAt));
    return json({
      apps: rows.map((row) => ({
        ...row.app,
        expertName: row.expertName || null,
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
    const input = AppBody.parse(await readJson(req));
    if (input.type === 'external') {
      if (!input.url) throw new ApiError(422, '外部应用需要填写访问地址');
      const parsed = HttpUrl.safeParse(input.url);
      if (!parsed.success) throw new ApiError(422, '请输入有效的 http(s) 地址');
    }
    if (input.type === 'internal' && !input.expertId) throw new ApiError(422, '内部应用需要绑定专家');
    await assertExpert(auth.org.id, input.expertId);
    const db = await getDb();
    const id = newId('app');
    await db.insert(apps).values({
      id,
      orgId: auth.org.id,
      name: input.name,
      description: input.description,
      category: input.category,
      icon: input.icon,
      accent: input.accent,
      type: input.type,
      url: input.type === 'external' ? input.url : '',
      expertId: input.type === 'internal' ? input.expertId : null,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
      createdBy: auth.user.id,
    });
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'app.create',
      { type: 'app', id },
      { name: input.name, type: input.type },
    );
    return json({ ok: true, id });
  } catch (err) {
    return errorResponse(err);
  }
}
