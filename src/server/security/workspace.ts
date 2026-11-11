import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '@/server/env';

const ROOT = path.join(DATA_DIR, 'workspaces');

function safeSegment(value: string): string {
  if (!value || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('非法的工作区标识');
  return value;
}

export function workspaceRoot(orgId: string, scopeId: string): string {
  return path.join(ROOT, safeSegment(orgId), safeSegment(scopeId));
}

export function resolveInWorkspace(orgId: string, scopeId: string, relative: string): string {
  const base = workspaceRoot(orgId, scopeId);
  if (path.isAbsolute(relative) || /^[\\/]/.test(relative)) {
    throw new Error('不允许绝对路径');
  }
  const cleaned = relative.replace(/\\/g, '/');
  if (!cleaned || cleaned.includes('\0')) throw new Error('文件路径不能为空');
  const normalized = path.normalize(cleaned);
  if (normalized.startsWith('..') || normalized.split('/').includes('..')) {
    throw new Error('文件路径不允许包含 ..');
  }
  if (path.isAbsolute(normalized)) throw new Error('不允许绝对路径');
  const full = path.join(base, normalized);
  if (full !== base && !full.startsWith(base + path.sep)) throw new Error('路径越界');
  return full;
}

export async function writeFile(
  orgId: string,
  scopeId: string,
  relative: string,
  content: string | Buffer,
): Promise<{ fullPath: string; size: number; relative: string }> {
  const full = resolveInWorkspace(orgId, scopeId, relative);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  await fs.writeFile(full, buffer);
  const realBase = await fs.realpath(workspaceRoot(orgId, scopeId));
  const realFile = await fs.realpath(full);
  if (!realFile.startsWith(realBase + path.sep)) throw new Error('路径越界');
  return { fullPath: full, size: buffer.byteLength, relative: path.relative(ROOT, full) };
}

export async function readFile(
  orgId: string,
  scopeId: string,
  relative: string,
): Promise<string> {
  const full = resolveInWorkspace(orgId, scopeId, relative);
  const realBase = await fs.realpath(workspaceRoot(orgId, scopeId));
  const realFile = await fs.realpath(full);
  if (!realFile.startsWith(realBase + path.sep)) throw new Error('路径越界');
  const stat = await fs.stat(realFile);
  if (stat.size > 2 * 1024 * 1024) throw new Error('文件超过 2MB，无法直接读取');
  return fs.readFile(realFile, 'utf8');
}

export async function listFiles(
  orgId: string,
  scopeId: string,
): Promise<Array<{ path: string; size: number; updatedAt: string }>> {
  const base = workspaceRoot(orgId, scopeId);
  const out: Array<{ path: string; size: number; updatedAt: string }> = [];
  async function walk(dir: string, prefix: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(full, rel);
      else {
        const stat = await fs.stat(full);
        out.push({ path: rel, size: stat.size, updatedAt: stat.mtime.toISOString() });
      }
    }
  }
  await walk(base, '');
  return out.slice(0, 200);
}

export async function removeFile(orgId: string, scopeId: string, relative: string): Promise<void> {
  const full = resolveInWorkspace(orgId, scopeId, relative);
  await fs.rm(full, { force: true });
}
