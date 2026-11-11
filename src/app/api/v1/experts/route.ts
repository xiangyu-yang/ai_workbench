import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { experts } from '@/server/db/schema';
import { requireApiKey } from '@/server/auth/api-key';
import { errorResponse, json } from '@/server/http';

export async function GET(req: Request) {
  try {
    const key = await requireApiKey(req, 'read');
    const db = await getDb();
    const rows = await db
      .select({
        id: experts.id,
        name: experts.name,
        description: experts.description,
        category: experts.category,
        defaultMode: experts.defaultMode,
      })
      .from(experts)
      .where(eq(experts.orgId, key.orgId))
      .orderBy(asc(experts.createdAt));
    return json({ experts: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
