import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { connectors } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { encryptSecret } from '@/server/security/crypto';
import { env } from '@/server/env';
import { audit } from '@/server/audit';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  transport: z.enum(['stdio', 'http', 'sse']).default('http'),
  command: z.string().max(300).optional(),
  args: z.array(z.string().max(300)).max(30).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().max(1000).optional(),
  headers: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
});

function encryptMap(input?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!key) continue;
    if (!value) continue;
    out[key] = encryptSecret(value);
  }
  return out;
}

export async function GET() {
  try {
    const auth = await requireApi('viewer');
    const db = await getDb();
    const rows = await db
      .select()
      .from(connectors)
      .where(eq(connectors.orgId, auth.org.id))
      .orderBy(asc(connectors.createdAt));
    return json({
      connectors: rows.map((row) => ({
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
        createdAt: row.createdAt,
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
    if (input.transport === 'stdio') {
      if (!env.MCP_ALLOW_STDIO) throw new ApiError(403, '当前部署禁用了 stdio 连接器');
      if (!input.command) throw new ApiError(422, 'stdio 连接器需要启动命令');
    } else {
      if (!input.url || !/^https?:\/\//.test(input.url)) {
        throw new ApiError(422, 'HTTP/SSE 连接器需要合法的 URL');
      }
    }
    const db = await getDb();
    const id = newId('con');
    await db.insert(connectors).values({
      id,
      orgId: auth.org.id,
      name: input.name,
      description: input.description,
      transport: input.transport,
      command: input.command || '',
      args: input.args || [],
      envEnc: encryptMap(input.env),
      url: input.url || '',
      headersEnc: encryptMap(input.headers),
      enabled: input.enabled,
      createdBy: auth.user.id,
    });
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'connector.create',
      { type: 'connector', id },
      { name: input.name, transport: input.transport },
    );
    return json({ ok: true, id }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
