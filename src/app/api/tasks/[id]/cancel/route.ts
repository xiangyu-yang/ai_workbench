import { cancelTask } from '@/server/tasks/runner';
import { ApiError, assertSameOrigin, errorResponse, json, requireApi } from '@/server/http';
import { audit } from '@/server/audit';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const { id } = await ctx.params;
    const ok = await cancelTask(id, auth.org.id);
    if (!ok) throw new ApiError(404, '任务不存在');
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'task.cancel',
      { type: 'task', id },
    );
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
