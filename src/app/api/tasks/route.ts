import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { experts, tasks } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { nextCronTime, validateCron } from '@/server/tasks/cron';
import { appendTaskEvent } from '@/server/tasks/events';
import { enqueueTask } from '@/server/tasks/runner';
import { audit } from '@/server/audit';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';

const ScheduleInput = z.object({
  enabled: z.boolean().default(false),
  cron: z.string().max(120).optional(),
  tzOffsetMinutes: z.number().int().min(-840).max(840).default(0),
});

const Body = z.object({
  title: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(20_000).default(''),
  expertId: z.string().optional(),
  schedule: ScheduleInput.optional(),
});

export async function GET(req: Request) {
  try {
    const auth = await requireApi('viewer');
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const db = await getDb();
    const rows = await db
      .select({
        task: tasks,
        expertName: experts.name,
      })
      .from(tasks)
      .leftJoin(experts, eq(experts.id, tasks.expertId))
      .where(
        and(
          eq(tasks.orgId, auth.org.id),
          status
            ? inArray(tasks.status, status.split(',').filter(Boolean))
            : undefined,
        ),
      )
      .orderBy(desc(tasks.createdAt))
      .limit(60);
    return json({
      tasks: rows.map((row) => ({
        ...row.task,
        expertName: row.expertName,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const input = Body.parse(await readJson(req));
    const db = await getDb();

    let expertId = input.expertId || null;
    if (expertId) {
      const owned = await db
        .select({ id: experts.id })
        .from(experts)
        .where(and(eq(experts.orgId, auth.org.id), eq(experts.id, expertId)))
        .limit(1);
      if (!owned.length) throw new ApiError(400, '专家不存在或不属于当前组织');
    }
    if (!expertId) {
      const rows = await db
        .select({ id: experts.id })
        .from(experts)
        .where(eq(experts.orgId, auth.org.id))
        .orderBy(asc(experts.createdAt))
        .limit(1);
      expertId = rows[0]?.id || null;
    }

    let schedule = { enabled: false } as {
      enabled: boolean;
      cron?: string;
      tzOffsetMinutes?: number;
      nextRunAt?: string | null;
    };
    if (input.schedule?.enabled) {
      if (!input.schedule.cron) throw new ApiError(422, '定时任务需要 cron 表达式');
      const error = validateCron(input.schedule.cron);
      if (error) throw new ApiError(422, error);
      const next = nextCronTime(
        input.schedule.cron,
        new Date(),
        input.schedule.tzOffsetMinutes || 0,
      );
      if (!next) throw new ApiError(422, 'cron 表达式在未来一年内不会触发');
      schedule = {
        enabled: true,
        cron: input.schedule.cron,
        tzOffsetMinutes: input.schedule.tzOffsetMinutes || 0,
        nextRunAt: next.toISOString(),
      };
    }

    const id = newId('tsk');
    await db.insert(tasks).values({
      id,
      orgId: auth.org.id,
      title: input.title,
      goal: input.goal || input.title,
      expertId,
      mode: 'agent',
      status: 'queued',
      schedule,
      nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt) : null,
      createdBy: auth.user.id,
    });
    await appendTaskEvent(auth.org.id, id, 'task.created', {
      title: input.title,
      goal: input.goal,
      schedule: schedule.enabled ? schedule : null,
    });
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'task.create',
      { type: 'task', id },
      { title: input.title, scheduled: schedule.enabled },
    );
    enqueueTask(id);
    return json({ ok: true, id }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
