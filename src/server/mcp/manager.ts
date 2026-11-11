import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { connectorTools, connectors, type Connector } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { decryptSecret } from '@/server/security/crypto';
import { env } from '@/server/env';
import { ApiError } from '@/server/http';

type CachedClient = {
  client: import('@modelcontextprotocol/sdk/client/index.js').Client;
  toolNames: string[];
  at: number;
};

const globalMcp = globalThis as unknown as { __cuter_mcp?: Map<string, CachedClient> };
const cache = (globalMcp.__cuter_mcp ||= new Map<string, CachedClient>());
const TTL = 5 * 60 * 1000;

function decryptedEnv(row: Connector): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.envEnc || {})) {
    out[key] = decryptSecret(value);
  }
  return out;
}

function decryptedHeaders(row: Connector): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.headersEnc || {})) {
    out[key] = decryptSecret(value);
  }
  return out;
}

export async function connect(row: Connector) {
  const cached = cache.get(row.id);
  if (cached && Date.now() - cached.at < TTL) return cached.client;

  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const client = new Client(
    { name: 'cuter-workbench', version: '1.0.0' },
    { capabilities: {} },
  );
  const headers = decryptedHeaders(row);

  if (row.transport === 'stdio') {
    if (!env.MCP_ALLOW_STDIO) {
      throw new ApiError(403, '当前部署禁用了 stdio 连接器（MCP_ALLOW_STDIO=false）', 'stdio_disabled');
    }
    const { StdioClientTransport, getDefaultEnvironment } = await import(
      '@modelcontextprotocol/sdk/client/stdio.js'
    );
    const transport = new StdioClientTransport({
      command: row.command,
      args: row.args || [],
      env: { ...getDefaultEnvironment(), ...decryptedEnv(row) },
      stderr: 'ignore',
    });
    await client.connect(transport, { timeout: 25_000 });
  } else if (row.transport === 'sse') {
    const { SSEClientTransport } = await import('@modelcontextprotocol/sdk/client/sse.js');
    const transport = new SSEClientTransport(new URL(row.url), {
      requestInit: { headers },
    });
    await client.connect(transport, { timeout: 25_000 });
  } else {
    const { StreamableHTTPClientTransport } = await import(
      '@modelcontextprotocol/sdk/client/streamableHttp.js'
    );
    const transport = new StreamableHTTPClientTransport(new URL(row.url), {
      requestInit: { headers },
    });
    await client.connect(transport, { timeout: 25_000 });
  }

  cache.set(row.id, { client, toolNames: [], at: Date.now() });
  return client;
}

export async function closeConnector(id: string): Promise<void> {
  const cached = cache.get(id);
  if (!cached) return;
  cache.delete(id);
  try {
    await cached.client.close();
  } catch {
    /* ignore */
  }
}

export type McpToolInfo = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export async function discoverTools(row: Connector): Promise<McpToolInfo[]> {
  const client = await connect(row);
  const result = await client.listTools({}, { timeout: 20_000 });
  return (result.tools || []).map((tool) => ({
    name: tool.name,
    description: tool.description || '',
    inputSchema:
      tool.inputSchema && typeof tool.inputSchema === 'object'
        ? (tool.inputSchema as Record<string, unknown>)
        : { type: 'object', properties: {} },
  }));
}

export async function syncConnectorTools(row: Connector): Promise<McpToolInfo[]> {
  const db = await getDb();
  try {
    const tools = await discoverTools(row);
    await db
      .delete(connectorTools)
      .where(and(eq(connectorTools.connectorId, row.id), eq(connectorTools.orgId, row.orgId)));
    if (tools.length) {
      await db.insert(connectorTools).values(
        tools.map((tool) => ({
          id: newId('ctl'),
          orgId: row.orgId,
          connectorId: row.id,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          enabled: true,
        })),
      );
    }
    await db
      .update(connectors)
      .set({
        status: 'healthy',
        lastError: '',
        lastCheckedAt: new Date(),
        toolCount: tools.length,
        updatedAt: new Date(),
      })
      .where(eq(connectors.id, row.id));
    return tools;
  } catch (err) {
    const message = err instanceof Error ? err.message : '连接失败';
    await db
      .update(connectors)
      .set({
        status: 'error',
        lastError: message.slice(0, 500),
        lastCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(connectors.id, row.id));
    cache.delete(row.id);
    throw new ApiError(502, `连接器不可用：${message}`, 'mcp_error');
  }
}

export async function getConnectorTools(row: Connector): Promise<McpToolInfo[]> {
  const db = await getDb();
  const cachedTools = await db
    .select()
    .from(connectorTools)
    .where(and(eq(connectorTools.connectorId, row.id), eq(connectorTools.enabled, true)));
  const stale = !cachedTools.length || !row.lastCheckedAt || Date.now() - row.lastCheckedAt.getTime() > TTL;
  if (stale && row.enabled) {
    try {
      return await syncConnectorTools(row);
    } catch {
      /* fall through to cached */
    }
  }
  return cachedTools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
}

export async function callMcpTool(
  row: Connector,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: string; isError: boolean }> {
  const client = await connect(row);
  const result = await client.callTool(
    { name: toolName, arguments: args },
    undefined,
    { timeout: 60_000 },
  );
  const content = Array.isArray(result.content) ? result.content : [];
  const parts: string[] = [];
  for (const item of content) {
    const block = item as { type?: string; text?: string; mimeType?: string; resource?: unknown };
    if (block.type === 'text' && block.text) parts.push(block.text);
    else if (block.type === 'image') parts.push(`[图片 ${block.mimeType || ''}]`);
    else if (block.type === 'resource') parts.push(JSON.stringify(block.resource));
    else parts.push(JSON.stringify(block));
  }
  const structured = (result as { structuredContent?: unknown }).structuredContent;
  if (structured && !parts.length) parts.push(JSON.stringify(structured));
  return {
    content: parts.join('\n\n') || '（工具无返回内容）',
    isError: Boolean(result.isError),
  };
}

export async function shutdownMcp(): Promise<void> {
  for (const [id] of cache) await closeConnector(id);
}
