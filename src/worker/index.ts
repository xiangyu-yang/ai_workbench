import { env } from '@/server/env';
import { ensureScheduler, enqueueQueuedTasks, runnerStats } from '@/server/tasks/runner';
import { shutdownMcp } from '@/server/mcp/manager';

async function main() {
  if (!env.DATABASE_URL) {
    console.error(
      '[cuter worker] 外部 Worker 需要 DATABASE_URL（PGlite 为单进程内嵌数据库，仅在 Web 进程内运行）',
    );
    process.exit(1);
  }
  ensureScheduler(true);
  await enqueueQueuedTasks();
  console.log('[cuter worker] 已启动', runnerStats());

  const heartbeat = setInterval(() => {
    console.log('[cuter worker] heartbeat', JSON.stringify(runnerStats()));
  }, 60_000);

  const shutdown = async (signal: string) => {
    console.log(`[cuter worker] 收到 ${signal}，正在退出…`);
    clearInterval(heartbeat);
    await shutdownMcp();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
