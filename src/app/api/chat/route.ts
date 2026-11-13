import { and, asc, eq, isNull, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import {
  attachments,
  experts,
  messages,
  skills,
  threads,
  type MessagePart,
} from '@/server/db/schema';
import { ApiError, requireApi, assertSameOrigin, errorResponse, readJson, sseResponse, rateLimit } from '@/server/http';
import { newId } from '@/server/ids';
import { startAgentRun } from '@/server/agent/run-manager';
import { assertQuota } from '@/server/usage';
import { assertSelectableSkills } from '@/server/skills/selectable';

const Body = z.object({
  threadId: z.string().optional(),
  expertId: z.string().nullish(),
  mode: z.enum(['ask', 'plan', 'agent']).default('agent'),
  text: z.string().max(50_000).default(''),
  attachmentIds: z.array(z.string()).max(6).optional(),
  skillIds: z.array(z.string()).max(5).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const body = Body.parse(await readJson(req));
    let mode = body.mode;
    const text = body.text.trim();
    const attachmentIds = body.attachmentIds || [];
    if (!text && !attachmentIds.length) {
      throw new ApiError(422, '消息不能为空');
    }
    rateLimit(`chat:${auth.user.id}`, 30, 60_000);
    await assertQuota(auth.org.id, auth.org.tokenQuotaMonthly);

    const db = await getDb();
    let threadId = body.threadId;
    let thread = null as typeof threads.$inferSelect | null;

    if (threadId) {
      const rows = await db
        .select()
        .from(threads)
        .where(and(eq(threads.id, threadId), eq(threads.orgId, auth.org.id)))
        .limit(1);
      thread = rows[0] || null;
      if (!thread) throw new ApiError(404, '会话不存在');
      if (thread.userId !== auth.user.id) throw new ApiError(403, '无权访问该会话');
      if (thread.source !== 'chat') throw new ApiError(403, '任务会话不支持直接对话');
    }

    if (body.expertId) {
      const owned = await db
        .select({ id: experts.id })
        .from(experts)
        .where(and(eq(experts.orgId, auth.org.id), eq(experts.id, body.expertId)))
        .limit(1);
      if (!owned.length) throw new ApiError(400, '专家不存在或不属于当前组织');
    }

    let skillIds: string[] | null = null;
    if (body.skillIds !== undefined) {
      skillIds = (await assertSelectableSkills(auth.org.id, auth.user.id, auth.role, body.skillIds)) ?? null;
    } else if (thread) {
      skillIds = thread.skillIds ?? null;
    }

    if (skillIds?.length && mode !== 'agent') {
      const selected = await db
        .select({ manifest: skills.manifest })
        .from(skills)
        .where(and(eq(skills.orgId, auth.org.id), inArray(skills.id, skillIds)));
      if (selected.some((row) => row.manifest?.requiresExecution)) {
        // 股票行情等技能必须执行脚本；问答/规划模式自动升级为执行，避免出现“未知工具”。
        mode = 'agent';
      }
    }

    let expertId: string | null = thread?.expertId || null;
    if (body.expertId !== undefined) expertId = body.expertId;
    if (expertId === undefined) expertId = null;
    if (!expertId) {
      const fallbackRows = await db
        .select({ id: experts.id })
        .from(experts)
        .where(eq(experts.orgId, auth.org.id))
        .orderBy(asc(experts.createdAt))
        .limit(1);
      expertId = fallbackRows[0]?.id || null;
    }

    const attachmentRows = attachmentIds.length
      ? await db
          .select()
          .from(attachments)
          .where(
            and(
              eq(attachments.orgId, auth.org.id),
              inArray(attachments.id, attachmentIds),
              isNull(attachments.messageId),
            ),
          )
      : [];

    let title = text.slice(0, 42).replace(/\s+/g, ' ').trim() || attachmentRows[0]?.name || '新对话';

    if (!thread) {
      threadId = newId('thr');
      await db.insert(threads).values({
        id: threadId,
        orgId: auth.org.id,
        userId: auth.user.id,
        expertId,
        title,
        mode,
        skillIds,
        source: 'chat',
      });
    } else {
      await db
        .update(threads)
        .set({
          expertId,
          mode,
          skillIds,
          title: thread.title === '新对话' ? title : thread.title,
          updatedAt: new Date(),
        })
        .where(eq(threads.id, thread.id));
    }

    const userParts: MessagePart[] = [];
    if (text) userParts.push({ type: 'text', text });
    for (const file of attachmentRows) {
      userParts.push({
        type: 'attachment',
        attachmentId: file.id,
        name: file.name,
        mime: file.mime,
        size: file.size,
        kind: file.kind,
      });
    }

    const userMessageId = newId('msg');
    await db.insert(messages).values({
      id: userMessageId,
      orgId: auth.org.id,
      threadId: threadId as string,
      role: 'user',
      parts: userParts,
      content: text,
      status: 'completed',
    });

    for (const file of attachmentRows) {
      await db
        .update(attachments)
        .set({ threadId, messageId: userMessageId })
        .where(eq(attachments.id, file.id));
    }

    const assistantId = newId('msg');
    await db.insert(messages).values({
      id: assistantId,
      orgId: auth.org.id,
      threadId: threadId as string,
      role: 'assistant',
      parts: [],
      content: '',
      status: 'streaming',
    });

    return sseResponse(async (send) => {
      const run = startAgentRun({
        orgId: auth.org.id,
        userId: auth.user.id,
        threadId: threadId as string,
        messageId: assistantId,
        mode,
        skillIds,
        emit: (event) => send(event.type, event),
      });
      await run.promise;
    });
  } catch (err) {
    return errorResponse(err);
  }
}
