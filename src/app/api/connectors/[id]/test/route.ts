import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { connectors } from '@/server/db/schema';
import { syncConnectorTools } from '@/server/mcp/manager';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(connectors)
      .where(and(eq(connectors.orgId, auth.org.id), eq(connectors.id, id)))
      .limit(1);
    const connector = rows[0];
    if (!connector) throw new ApiError(404, '连接器不存在');

    const tools = await syncConnectorTools(connector);
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'connector.test',
      { type: 'connector', id },
      { toolCount: tools.length },
    );
    return json({
      ok: true,
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
