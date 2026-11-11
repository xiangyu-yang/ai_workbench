import fs from 'node:fs';
import path from 'node:path';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { DATA_DIR, env } from '@/server/env';
import * as schema from './schema';

/**
 * 统一使用 Postgres 语义。开发/单机使用 PGlite（WASM Postgres），
 * 生产通过 DATABASE_URL 切换到 Postgres，两份驱动共享同一套 schema 与迁移。
 */
export type DB = PgliteDatabase<typeof schema>;

const globalStore = globalThis as unknown as { __cuter_db?: Promise<DB> };

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

let pgliteLockPath: string | null = null;

function releasePgliteLock(): void {
  if (!pgliteLockPath) return;
  try {
    fs.unlinkSync(pgliteLockPath);
  } catch {
    /* already gone */
  }
  pgliteLockPath = null;
}

/**
 * PGlite 是单进程嵌入式数据库。用文件锁避免 Web 与脚本/第二个实例并发打开同一目录，
 * 这会导致 WASM 层 Aborted 或数据损坏。
 */
function acquirePgliteLock(): void {
  const lockPath = path.join(DATA_DIR, '.pg.lock');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      fs.closeSync(fd);
      pgliteLockPath = lockPath;
      process.once('exit', releasePgliteLock);
      process.once('SIGINT', () => {
        releasePgliteLock();
        process.exit(0);
      });
      process.once('SIGTERM', () => {
        releasePgliteLock();
        process.exit(0);
      });
      return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      let owner: { pid?: number } = {};
      try {
        owner = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid?: number };
      } catch {
        /* corrupt lock */
      }
      if (owner.pid && alive(owner.pid)) {
        throw new Error(
          `PGlite 数据目录已被进程 ${owner.pid} 占用。请停止该进程后重试；生产多进程部署请使用 DATABASE_URL 连接 PostgreSQL。`,
        );
      }
      fs.rmSync(lockPath, { force: true });
    }
  }
  throw new Error('无法获取 PGlite 数据目录锁，请检查 DATA_DIR 权限');
}

async function ensureMigrations(db: DB, driver: 'pglite' | 'pg'): Promise<void> {
  if (!env.MIGRATE_ON_BOOT) return;
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  if (!fs.existsSync(path.join(migrationsFolder, 'meta', '_journal.json'))) {
    console.warn('[cuter] 未找到迁移目录，跳过自动迁移');
    return;
  }
  try {
    if (driver === 'pglite') {
      const { migrate } = await import('drizzle-orm/pglite/migrator');
      await migrate(db as never, { migrationsFolder });
    } else {
      const { migrate } = await import('drizzle-orm/node-postgres/migrator');
      await migrate(db as never, { migrationsFolder });
    }
    console.log('[cuter] 数据库迁移已就绪');
  } catch (err) {
    if (driver === 'pglite' && /Aborted|ASSERTIONS/i.test((err as Error).message)) {
      console.error(
        '[cuter] PGlite 启动失败：数据目录可能被其他进程占用或已损坏。请确认没有第二个实例，必要时从备份恢复 DATA_DIR。',
      );
    }
    console.error('[cuter] 数据库迁移失败', err);
    throw err;
  }
}

async function createDb(): Promise<DB> {
  if (env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: Number(process.env.PG_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      application_name: 'cuter-workbench',
    });
    pool.on('error', (err) => console.error('[cuter] postgres pool error', err));
    const db = drizzle(pool, { schema });
    await ensureMigrations(db as unknown as DB, 'pg');
    console.log('[cuter] 数据层：PostgreSQL');
    return db as unknown as DB;
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const dir = path.join(DATA_DIR, 'pg');
  fs.mkdirSync(dir, { recursive: true });
  acquirePgliteLock();
  try {
    const client = new PGlite(dir);
    const db = drizzle(client, { schema });
    await ensureMigrations(db as unknown as DB, 'pglite');
    console.log(`[cuter] 数据层：PGlite (${dir})`);
    return db as unknown as DB;
  } catch (err) {
    releasePgliteLock();
    if (/Aborted|ASSERTIONS/i.test((err as Error).message)) {
      throw new Error(
        `PGlite 数据目录无法打开（可能损坏或被占用）：${dir}。请停止其他实例；若仍失败，从备份恢复该目录。`,
      );
    }
    throw err;
  }
}

export function getDb(): Promise<DB> {
  if (!globalStore.__cuter_db) {
    globalStore.__cuter_db = createDb().catch((err) => {
      globalStore.__cuter_db = undefined;
      throw err;
    });
  }
  return globalStore.__cuter_db;
}

export { schema };
