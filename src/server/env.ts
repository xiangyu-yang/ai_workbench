import fs from 'node:fs';
import path from 'node:path';

function bool(v: string | undefined, fallback = false): boolean {
  if (v == null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

const root = process.cwd();
export const DATA_DIR = path.resolve(root, process.env.DATA_DIR || '.data');
export const APP_URL = process.env.APP_URL || 'http://localhost:3100';
export const IS_PROD = process.env.NODE_ENV === 'production';

let cachedSecret: string | null = null;

/**
 * 应用根密钥。生产必须通过环境变量注入；单机部署若缺失则在数据目录生成并持久化，
 * 以保证重启后已加密的凭据仍可解密。
 */
export function appSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.APP_SECRET;
  if (fromEnv && fromEnv.length >= 16) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }
  if (IS_PROD && process.env.ALLOW_EPHEMERAL_SECRET !== 'true') {
    throw new Error('APP_SECRET is required in production (>=16 chars)');
  }
  const file = path.join(DATA_DIR, '.app-secret');
  try {
    if (fs.existsSync(file)) {
      cachedSecret = fs.readFileSync(file, 'utf8').trim();
      return cachedSecret;
    }
  } catch {
    /* ignore */
  }
  const generated = crypto.randomUUID() + crypto.randomUUID();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, generated, { mode: 0o600 });
  console.warn('[cuter] APP_SECRET 未配置，已在数据目录生成临时密钥（生产请显式配置）');
  cachedSecret = generated;
  return cachedSecret;
}

export const env = {
  APP_URL,
  IS_PROD,
  DEMO_MODE: bool(process.env.DEMO_MODE, true),
  MCP_ALLOW_STDIO: bool(process.env.MCP_ALLOW_STDIO, true),
  SKILL_ALLOW_SCRIPTS: bool(process.env.SKILL_ALLOW_SCRIPTS, true),
  INPROCESS_WORKER: bool(process.env.INPROCESS_WORKER, true),
  TASK_CONCURRENCY: Math.max(1, Number(process.env.TASK_CONCURRENCY || 2)),
  MIGRATE_ON_BOOT: bool(process.env.MIGRATE_ON_BOOT, true),
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || '',
  TOOL_ALLOWED_HOSTS: (process.env.TOOL_ALLOWED_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  DATABASE_URL: process.env.DATABASE_URL || '',
};

export const VERSION = '1.0.0';
