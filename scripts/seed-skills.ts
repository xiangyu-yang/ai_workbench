import { asc, eq } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import { memberships, orgs, users } from '../src/server/db/schema';
import { SKILL_LIBRARY } from '../src/server/skills/library';
import { bindSeedSkills, installSkillLibrary } from '../src/server/skills/install';

async function main() {
  const force = process.argv.includes('--force');
  const orgArgIndex = process.argv.indexOf('--org');
  const orgArg = orgArgIndex >= 0 ? process.argv[orgArgIndex + 1] : '';
  const onlyArgIndex = process.argv.indexOf('--only');
  const only = onlyArgIndex >= 0 ? [process.argv[onlyArgIndex + 1]].filter(Boolean) : [];
  const db = await getDb();

  const orgRows = orgArg
    ? await db.select().from(orgs).where(eq(orgs.id, orgArg)).limit(1)
    : await db.select().from(orgs).orderBy(asc(orgs.createdAt)).limit(1);
  const org = orgRows[0];
  if (!org) throw new Error('没有可用的组织，请先运行 npm run setup 或创建组织');

  const memberRows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.orgId, org.id))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  let userId = memberRows[0]?.userId;
  if (!userId) {
    const userRows = await db.select({ id: users.id }).from(users).limit(1);
    userId = userRows[0]?.id;
  }
  if (!userId) throw new Error('没有可用的用户');

  const result = await installSkillLibrary(org.id, userId, { force, only });
  const bound = await bindSeedSkills(org.id);
  console.log(`[cuter skills] 组织：${org.name} (${org.id})`);
  console.log(`[cuter skills] 新建 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}，绑定 ${bound}`);
  console.log(
    `[cuter skills] 技能库：${SKILL_LIBRARY.map((item) => item.name).join(' / ')}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[cuter skills] 失败', err);
    process.exit(1);
  });
