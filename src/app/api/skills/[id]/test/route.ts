import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { skills } from '@/server/db/schema';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  rateLimit,
  readJson,
  requireApi,
} from '@/server/http';
import { buildSkillTools } from '@/server/agent/tools/skill';
import { audit } from '@/server/audit';

const Body = z.object({
  toolName: z.string().optional(),
  args: z.record(z.unknown()).default({}),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    rateLimit(`skill-test:${auth.user.id}`, 20, 60_000);
    const { id } = await ctx.params;
    const body = Body.parse(await readJson(req));
    const db = await getDb();
    const rows = await db
      .select()
      .from(skills)
      .where(and(eq(skills.orgId, auth.org.id), eq(skills.id, id)))
      .limit(1);
    const skill = rows[0];
    if (!skill) throw new ApiError(404, '技能不存在');

    if (skill.type !== 'http' || !skill.manifest.tools.length) {
      return json({
        ok: true,
        mode: 'instruction',
        output: skill.instructions || '（该技能没有说明文本）',
      });
    }
    const tools = buildSkillTools(skill, skill.manifest, 0);
    const target = body.toolName ? tools.find((t) => t.name.endsWith(body.toolName as string)) || tools[0] : tools[0];
    const started = Date.now();
    const result = await target.execute(body.args, {
      orgId: auth.org.id,
      userId: auth.user.id,
      scopeId: 'skill-test',
      mode: 'ask',
      emit: () => undefined,
      kbIds: [],
    });
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'skill.test',
      { type: 'skill', id },
      { tool: target.name, ok: !result.isError },
    );
    return json({
      ok: !result.isError,
      output: result.content,
      durationMs: Date.now() - started,
      tool: target.name,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
