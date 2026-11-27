/**
 * 生产配置预检：只检查环境变量和拓扑开关，不连接外部服务。
 * 用法：APP_SECRET=... DATABASE_URL=... npm run production:check
 */
type Check = { name: string; ok: boolean; required: boolean; detail: string };

const checks: Check[] = [];

function add(name: string, ok: boolean, detail: string, required = true) {
  checks.push({ name, ok, required, detail });
}

const secret = process.env.APP_SECRET || '';
const database = process.env.DATABASE_URL || '';
const bucket = process.env.S3_BUCKET || '';
const search = process.env.SEARXNG_URL || process.env.TAVILY_API_KEY || '';

add('NODE_ENV', process.env.NODE_ENV === 'production', '生产构建应使用 NODE_ENV=production');
add('APP_SECRET', secret.length >= 32, '必须 >= 32 字符，且由 Secrets Manager 注入');
add('DATABASE_URL', Boolean(database), '生产不能使用内置 PGlite，必须连接 PostgreSQL');
add('INPROCESS_WORKER', process.env.INPROCESS_WORKER === 'false', '独立 Worker 部署时关闭进程内执行器');
add('MIGRATE_ON_BOOT', process.env.MIGRATE_ON_BOOT === 'false', '生产由迁移 Job 执行，不在 Web 启动时迁移');
add('S3_BUCKET', Boolean(bucket), '多副本建议使用 S3/MinIO；若使用共享卷，请确认 PVC/NFS', false);
add(
  'SKILL_ALLOW_SCRIPTS',
  process.env.SKILL_ALLOW_SCRIPTS !== 'true',
  '生产建议关闭脚本执行，除非已有隔离沙箱',
  false,
);
add(
  'WEB_SEARCH',
  Boolean(search),
  '未配置 SEARXNG_URL/TAVILY_API_KEY 时只有 DuckDuckGo best-effort 回退',
  false,
);

const failed = checks.filter((check) => check.required && !check.ok);
for (const check of checks) {
  const mark = check.ok ? 'OK  ' : check.required ? 'FAIL' : 'WARN';
  console.log(`[${mark}] ${check.name}: ${check.detail}`);
}
if (failed.length) {
  console.error(`\n生产预检失败：${failed.length} 个必选项未通过`);
  process.exit(1);
}
console.log('\n生产预检通过（外部服务连通性仍需单独验证）');
