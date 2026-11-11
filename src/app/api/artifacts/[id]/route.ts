import fs from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from '@/server/env';
import { getArtifact } from '@/server/artifacts';
import { ApiError, errorResponse, requireApi } from '@/server/http';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const artifact = await getArtifact(auth.org.id, id);
    if (!artifact) throw new ApiError(404, '交付物不存在');

    const candidates = [
      path.join(DATA_DIR, artifact.path),
      path.join(DATA_DIR, 'workspaces', artifact.path),
    ].filter((candidate) => candidate.startsWith(DATA_DIR));
    let buffer: Buffer | null = null;
    for (const candidate of candidates) {
      try {
        buffer = await fs.readFile(candidate);
        break;
      } catch {
        /* try next */
      }
    }
    if (!buffer) throw new ApiError(404, '交付物文件已丢失');

    const url = new URL(req.url);
    const download = url.searchParams.get('download') === '1';
    const isHtml = artifact.mime === 'text/html';
    const mime = isHtml ? 'text/plain; charset=utf-8' : artifact.mime;
    const encodedName = encodeURIComponent(artifact.name);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': mime,
        'content-length': String(buffer.byteLength),
        'content-disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodedName}`,
        'cache-control': 'private, max-age=60',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
