import { asc, eq } from 'drizzle-orm';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { connectors } from '@/server/db/schema';
import { ConnectorManager } from '@/components/connectors/connector-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: '连接器' };

export default async function ConnectorsPage() {
  const auth = await requirePageAuth();
  const db = await getDb();
  const rows = await db
    .select()
    .from(connectors)
    .where(eq(connectors.orgId, auth.org.id))
    .orderBy(asc(connectors.createdAt));

  return (
    <ConnectorManager
      isAdmin={auth.role === 'owner' || auth.role === 'admin'}
      allowStdio={process.env.MCP_ALLOW_STDIO !== 'false'}
      connectors={rows.map((row) => ({
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
        lastCheckedAt: row.lastCheckedAt?.toISOString() || null,
        toolCount: row.toolCount,
        envKeys: Object.keys(row.envEnc || {}),
        headerKeys: Object.keys(row.headersEnc || {}),
      }))}
    />
  );
}
