import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { connectorTools, connectors } from '@/server/db/schema';
import { ApiError, errorResponse, json, requireApi } from '@/server/http';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(connectors)
      .where(and(eq(connectors.orgId, auth.org.id), eq(connectors.id, id)))
      .limit(1);
    if (!rows[0]) throw new ApiError(404, '连接器不存在');
    const tools = await db
      .select()
      .from(connectorTools)
      .where(and(eq(connectorTools.orgId, auth.org.id), eq(connectorTools.connectorId, id)));
    return json({ tools });
  } catch (err) {
    return errorResponse(err);
  }
}
