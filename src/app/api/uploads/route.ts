import fs from 'node:fs/promises';
import path from 'node:path';
import { getDb } from '@/server/db/client';
import { attachments } from '@/server/db/schema';
import { DATA_DIR } from '@/server/env';
import { newId } from '@/server/ids';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  rateLimit,
  requireApi,
} from '@/server/http';

const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_FILE = 10 * 1024 * 1024;

function safeName(name: string): string {
  return (name || 'file').replace(/[\\/:*?"<>|\u0000]/g, '_').slice(0, 120);
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    rateLimit(`upload:${auth.user.id}`, 40, 60_000);

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new ApiError(400, '缺少文件');
    const kind: 'image' | 'file' = file.type.startsWith('image/') ? 'image' : 'file';
    const limit = kind === 'image' ? MAX_IMAGE : MAX_FILE;
    if (file.size > limit) {
      throw new ApiError(413, `文件超过 ${Math.round(limit / 1024 / 1024)}MB 限制`);
    }
    if (file.size === 0) throw new ApiError(400, '文件为空');

    const id = newId('att');
    const name = safeName(file.name);
    const rel = path.join('uploads', auth.org.id, 'chat', `${id}-${name}`);
    const full = path.join(DATA_DIR, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, Buffer.from(await file.arrayBuffer()));

    const db = await getDb();
    await db.insert(attachments).values({
      id,
      orgId: auth.org.id,
      name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      path: rel,
      kind,
    });

    return json({ id, name, mime: file.type, size: file.size, kind });
  } catch (err) {
    return errorResponse(err);
  }
}
