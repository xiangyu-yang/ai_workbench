import { asc, desc, eq } from 'drizzle-orm';
import { requirePageAuth } from '@/server/auth/session';
import { getDb } from '@/server/db/client';
import { experts, tasks } from '@/server/db/schema';
import { TaskBoard } from '@/components/tasks/task-board';
import { listSelectableSkills } from '@/server/skills/selectable';

export const dynamic = 'force-dynamic';
export const metadata = { title: '任务' };

export default async function TasksPage() {
  const auth = await requirePageAuth();
  const db = await getDb();
  const [rows, expertRows, skillRows] = await Promise.all([
    db
      .select({ task: tasks, expertName: experts.name })
      .from(tasks)
      .leftJoin(experts, eq(experts.id, tasks.expertId))
      .where(eq(tasks.orgId, auth.org.id))
      .orderBy(desc(tasks.createdAt))
      .limit(80),
    db
      .select({
        id: experts.id,
        name: experts.name,
        icon: experts.icon,
        accent: experts.accent,
      })
      .from(experts)
      .where(eq(experts.orgId, auth.org.id))
      .orderBy(asc(experts.createdAt)),
    listSelectableSkills(auth.org.id, auth.user.id, auth.role),
  ]);

  return (
    <TaskBoard
      canManage={auth.role !== 'viewer'}
      experts={expertRows}
      skills={skillRows.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description, category: skill.category }))}
      tasks={rows.map(({ task, expertName }) => ({
        id: task.id,
        title: task.title,
        goal: task.goal,
        status: task.status,
        progress: task.progress,
        expertId: task.expertId,
        expertName: expertName || '通用助手',
        schedule: task.schedule,
        nextRunAt: task.nextRunAt?.toISOString() || null,
        lastRunAt: task.lastRunAt?.toISOString() || null,
        runCount: task.runCount,
        error: task.error,
        resultSummary: task.resultSummary,
        createdAt: task.createdAt.toISOString(),
        finishedAt: task.finishedAt?.toISOString() || null,
      }))}
    />
  );
}
