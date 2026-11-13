import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import {
  apps,
  expertSkills,
  experts,
  memberships,
  orgs,
  skills,
  users,
} from '../src/server/db/schema';
import { newId } from '../src/server/ids';
import { STOCK_ADVISOR, STOCK_APP } from '../src/server/experts/stock';

async function main() {
  const orgArgIndex = process.argv.indexOf('--org');
  const orgArg = orgArgIndex >= 0 ? process.argv[orgArgIndex + 1] : '';
  const db = await getDb();
  const orgRows = orgArg
    ? await db.select().from(orgs).where(eq(orgs.id, orgArg)).limit(1)
    : await db.select().from(orgs).orderBy(asc(orgs.createdAt)).limit(1);
  const org = orgRows[0];
  if (!org) throw new Error('没有可用组织');

  const memberRows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.orgId, org.id))
    .limit(1);
  let userId = memberRows[0]?.userId;
  if (!userId) {
    const userRows = await db.select({ id: users.id }).from(users).limit(1);
    userId = userRows[0]?.id;
  }
  if (!userId) throw new Error('没有可用用户');

  const skillRows = await db.select().from(skills).where(eq(skills.orgId, org.id));
  const byName = new Map(skillRows.map((skill) => [skill.name, skill]));
  const stockSkill = byName.get('股票深度分析与预测');
  if (!stockSkill) throw new Error('缺少「股票深度分析与预测」技能，请先运行 npm run db:seed-skills -- --force --only 股票深度分析与预测');

  let expertRows = await db
    .select()
    .from(experts)
    .where(and(eq(experts.orgId, org.id), eq(experts.name, STOCK_ADVISOR.name)))
    .limit(1);
  let expert = expertRows[0];
  if (!expert) {
    const id = newId('exp');
    await db.insert(experts).values({
      ...STOCK_ADVISOR,
      id,
      orgId: org.id,
      createdBy: userId,
    });
    expertRows = await db.select().from(experts).where(eq(experts.id, id)).limit(1);
    expert = expertRows[0];
  }
  if (!expert) throw new Error('创建股票专家失败');

  let appRows = await db
    .select()
    .from(apps)
    .where(and(eq(apps.orgId, org.id), eq(apps.name, STOCK_APP.name)))
    .limit(1);
  if (!appRows[0]) {
    await db.insert(apps).values({
      ...STOCK_APP,
      id: newId('app'),
      orgId: org.id,
      expertId: expert.id,
      createdBy: userId,
    });
    appRows = await db
      .select()
      .from(apps)
      .where(and(eq(apps.orgId, org.id), eq(apps.name, STOCK_APP.name)))
      .limit(1);
  } else if (appRows[0].expertId !== expert.id) {
    await db.update(apps).set({ expertId: expert.id }).where(eq(apps.id, appRows[0].id));
  }

  const bindTargets = [
    stockSkill,
    byName.get('深度调研方法论'),
    byName.get('数据分析与洞察'),
  ].filter((skill): skill is NonNullable<typeof stockSkill> => Boolean(skill));
  let bound = 0;
  for (const skill of bindTargets) {
    const existing = await db
      .select({ id: expertSkills.id })
      .from(expertSkills)
      .where(
        and(
          eq(expertSkills.orgId, org.id),
          eq(expertSkills.expertId, expert.id),
          eq(expertSkills.skillId, skill.id),
        ),
      )
      .limit(1);
    if (existing.length) continue;
    await db.insert(expertSkills).values({
      id: newId('esk'),
      orgId: org.id,
      expertId: expert.id,
      skillId: skill.id,
      version: 0,
      enabled: true,
    });
    bound += 1;
  }

  console.log(`[cuter stock] 组织：${org.name}`);
  console.log(`[cuter stock] 专家：${expert.name} (${expert.id})`);
  console.log(`[cuter stock] 应用：${STOCK_APP.name} (${appRows[0]?.id || 'created'})`);
  console.log(`[cuter stock] 绑定技能 ${bound} 个；股票技能 v${stockSkill.version}，${stockSkill.manifest.fileCount || 0} 个文件`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[cuter stock] 失败', err);
    process.exit(1);
  });
