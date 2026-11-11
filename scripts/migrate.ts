import { getDb } from '../src/server/db/client';

async function main() {
  const db = await getDb();
  await db.execute((await import('drizzle-orm')).sql`select 1`);
  console.log('[cuter] 数据库迁移完成');
  process.exit(0);
}

void main().catch((err) => {
  console.error('[cuter] 迁移失败', err);
  process.exit(1);
});
