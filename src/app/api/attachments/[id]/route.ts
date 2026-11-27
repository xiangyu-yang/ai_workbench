import { and, eq } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { attachments } from '@/server/db/schema';
import { ApiError, errorResponse, requireApi } from '@/server/http';
import { getObject } from '@/server/storage';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireApi('viewer');
    const { id } = await ctx.params;
    const db = await getDb();
    const rows = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.orgId, auth.org.id), eq(attachments.id, id)))
      .limit(1);
    const attachment = rows[0];
    if (!attachment) throw new ApiError(404, '附件不存在');

    let buffer: Buffer;
    try {
      buffer = await getObject(attachment.path);
    } catch {
      throw new ApiError(404, '附件文件已丢失');
    }

    const isImage = attachment.mime.startsWith('image/') && attachment.mime !== 'image/svg+xml';
    return new Response(new Uint8Array(buffer), {
      headers: {
        'content-type': isImage ? attachment.mime : 'text/plain; charset=utf-8',
        'content-length': String(buffer.byteLength),
        'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(attachment.name)}`,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
