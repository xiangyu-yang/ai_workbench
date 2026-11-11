import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import {
  approvals,
  experts,
  messages,
  orgs,
  threads,
  type MessagePart,
} from '@/server/db/schema';
import { newId } from '@/server/ids';
import { requireApiKey } from '@/server/auth/api-key';
import { ApiError, errorResponse, json, readJson } from '@/server/http';
import { runAgent } from '@/server/agent/runtime';
import { assertQuota } from '@/server/usage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const Body = z.object({
  input: z.string().trim().min(1).max(50_000),
  mode: z.enum(['ask', 'plan', 'agent']).default('agent'),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const key = await requireApiKey(req, 'write');
    const { id } = await ctx.params;
    const body = Body.parse(await readJson(req));
    const db = await getDb();

    const expertRows = await db
      .select()
      .from(experts)
      .where(and(eq(experts.orgId, key.orgId), eq(experts.id, id)))
      .limit(1);
    if (!expertRows[0]) throw new ApiError(404, '专家不存在');
    const orgRows = await db.select().from(orgs).where(eq(orgs.id, key.orgId)).limit(1);
    if (!orgRows[0]) throw new ApiError(404, '组织不存在');
    await assertQuota(key.orgId, orgRows[0].tokenQuotaMonthly);

    const threadId = newId('thr');
    await db.insert(threads).values({
      id: threadId,
      orgId: key.orgId,
      userId: key.createdBy || `apikey_${key.keyId}`,
      expertId: id,
      title: body.input.slice(0, 40),
      mode: body.mode,
      source: 'api',
    });
    await db.insert(messages).values({
      id: newId('msg'),
      orgId: key.orgId,
      threadId,
      role: 'user',
      parts: [{ type: 'text', text: body.input }],
      content: body.input,
      status: 'completed',
    });
    const assistantId = newId('msg');
    await db.insert(messages).values({
      id: assistantId,
      orgId: key.orgId,
      threadId,
      role: 'assistant',
      parts: [],
      content: '',
      status: 'streaming',
    });

    const outcome = await runAgent({
      orgId: key.orgId,
      userId: key.createdBy || `apikey_${key.keyId}`,
      threadId,
      messageId: assistantId,
      mode: body.mode,
      emit: () => undefined,
    });

    const msgRows = await db.select().from(messages).where(eq(messages.id, assistantId)).limit(1);
    const parts = (msgRows[0]?.parts || []) as MessagePart[];
    const artifacts = parts.filter((p) => p.type === 'artifact');
    const pending = await db
      .select({ id: approvals.id, toolName: approvals.toolName, status: approvals.status })
      .from(approvals)
      .where(and(eq(approvals.orgId, key.orgId), eq(approvals.messageId, assistantId)));

    return json({
      ok: outcome.status === 'completed',
      status: outcome.status,
      threadId,
      messageId: assistantId,
      content: outcome.content,
      usage: {
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
      },
      artifacts,
      approvals: pending,
      error: outcome.error || null,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
