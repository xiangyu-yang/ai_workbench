import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { connectors } from '@/server/db/schema';
import { encryptSecret } from '@/server/security/crypto';
import { env } from '@/server/env';
import { closeConnector } from '@/server/mcp/manager';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { audit } from '@/server/audit';

const PatchBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  transport: z.enum(['stdio', 'http', 'sse']).optional(),
  command: z.string().max(300).optional(),
  args: z.array(z.string().max(300)).max(30).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().max(1000).optional(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().optional(),
});

function encryptMap(input?: Record<string, string>): Record<string, string> | undefined {
  if (!input) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!key) continue;
    if (!value) continue;
    out[key] = encryptSecret(value);
  }
  return out;
}

async function load(orgId: string, id: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(connectors)
    .where(and(eq(connectors.orgId, orgId), eq(connectors.id, id)))
    .limit(1);
  if (!rows[0]) throw new ApiError(404, '连接器不存在');
  return rows[0];
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const row = await load(auth.org.id, id);
    return json({
      connector: {
        id: row.id,
        name: row.name,
        description: row.description,
        transport: row.transport,
        command: row.command,
        args: row.args,
        url: row.url,
        enabled: row.enabled,
        status: row.status,
        lastError: row.lastError,
        lastCheckedAt: row.lastCheckedAt,
        toolCount: row.toolCount,
        envKeys: Object.keys(row.envEnc || {}),
        headerKeys: Object.keys(row.headersEnc || {}),
        envMasked: Object.fromEntries(
          Object.keys(row.envEnc || {}).map((k) => [k, '••••••••']),
        ),
        headersMasked: Object.fromEntries(
          Object.keys(row.headersEnc || {}).map((k) => [k, '••••••••']),
        ),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const row = await load(auth.org.id, id);
    const input = PatchBody.parse(await readJson(req));
    const transport = input.transport || row.transport;
    if (transport === 'stdio') {
      if (!env.MCP_ALLOW_STDIO) throw new ApiError(403, '当前部署禁用了 stdio 连接器');
      if (!(input.command ?? row.command)) throw new ApiError(422, 'stdio 连接器需要启动命令');
    } else if (!(input.url ?? row.url)) {
      throw new ApiError(422, 'HTTP/SSE 连接器需要 URL');
    }

    const envEnc = encryptMap(input.env);
    const headersEnc = encryptMap(input.headers);
    const db = await getDb();
    await db
      .update(connectors)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.transport !== undefined ? { transport: input.transport } : {}),
        ...(input.command !== undefined ? { command: input.command } : {}),
        ...(input.args !== undefined ? { args: input.args } : {}),
        ...(envEnc !== undefined ? { envEnc } : {}),
        ...(input.url !== undefined ? { url: input.url } : {}),
        ...(headersEnc !== undefined ? { headersEnc } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        status: 'unknown',
        updatedAt: new Date(),
      })
      .where(eq(connectors.id, id));
    await closeConnector(id);
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'connector.update',
      { type: 'connector', id },
      { name: input.name || row.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('admin');
    const { id } = await ctx.params;
    const row = await load(auth.org.id, id);
    await closeConnector(id);
    const db = await getDb();
    const { connectorTools, expertConnectors } = await import('@/server/db/schema');
    await db.delete(connectorTools).where(eq(connectorTools.connectorId, id));
    await db.delete(expertConnectors).where(eq(expertConnectors.connectorId, id));
    await db.delete(connectors).where(eq(connectors.id, id));
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'connector.delete',
      { type: 'connector', id },
      { name: row.name },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
