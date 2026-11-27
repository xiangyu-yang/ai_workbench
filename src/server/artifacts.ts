import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { artifacts } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { putObject } from '@/server/storage';
import type { Artifact } from '@/server/db/schema';

export function artifactKind(name: string, mime: string): Artifact['kind'] {
  const lower = name.toLowerCase();
  if (/\.(md|markdown|txt|html|pdf|docx)$/.test(lower) || mime.includes('word') || mime === 'application/pdf') {
    return 'document';
  }
  if (/\.(csv|tsv|xlsx|xls|json)$/.test(lower)) return 'data';
  if (/\.(ts|tsx|js|jsx|py|go|rs|java|sql|sh|css|yml|yaml)$/.test(lower)) return 'code';
  if (mime.startsWith('image/')) return 'image';
  return 'other';
}

export async function createArtifact(params: {
  orgId: string;
  scopeId: string;
  name: string;
  relativePath?: string;
  content: string | Buffer;
  mime?: string;
  taskId?: string | null;
  threadId?: string | null;
  messageId?: string | null;
}): Promise<Artifact> {
  const relative = (params.relativePath || params.name).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!relative || relative.split('/').includes('..')) throw new Error('非法交付物路径');
  const mime = params.mime || guessMime(params.name);
  const key = `workspaces/${params.orgId}/${params.scopeId}/${relative}`;
  const written = await putObject(key, params.content, mime);
  const db = await getDb();
  const row: typeof artifacts.$inferInsert = {
    id: newId('art'),
    orgId: params.orgId,
    taskId: params.taskId || null,
    threadId: params.threadId || null,
    messageId: params.messageId || null,
    name: params.name,
    mime,
    size: written.size,
    path: written.ref,
    kind: artifactKind(params.name, mime),
  };
  await db.insert(artifacts).values(row);
  const rows = await db.select().from(artifacts).where(eq(artifacts.id, row.id)).limit(1);
  return rows[0];
}

export function guessMime(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    '.md': 'text/markdown',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ts': 'text/plain',
    '.tsx': 'text/plain',
    '.py': 'text/plain',
    '.sql': 'text/plain',
    '.yml': 'text/plain',
    '.yaml': 'text/plain',
  };
  return map[ext] || 'application/octet-stream';
}

export async function getArtifact(orgId: string, id: string): Promise<Artifact | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.orgId, orgId), eq(artifacts.id, id)))
    .limit(1);
  return rows[0] || null;
}

export async function listThreadArtifacts(orgId: string, threadId: string): Promise<Artifact[]> {
  const db = await getDb();
  return db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.orgId, orgId), eq(artifacts.threadId, threadId)));
}
