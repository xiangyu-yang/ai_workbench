import { destroyCurrentSession, getAuth } from '@/server/auth/session';
import { audit } from '@/server/audit';
import { assertSameOrigin, errorResponse, json } from '@/server/http';

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await getAuth();
    if (auth) {
      await audit(
        { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
        'auth.logout',
        { type: 'user', id: auth.user.id },
      );
    }
    await destroyCurrentSession();
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
