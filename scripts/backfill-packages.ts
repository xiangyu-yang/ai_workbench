import { and, eq } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import { apps, experts, skillFiles, skillVersions, skills } from '../src/server/db/schema';
import { newId } from '../src/server/ids';
import { ensureSkillPackage, loadSkillFiles, mimeOf, toPackageFile } from '../src/server/skills/package';

async function main() {
  const db = await getDb();
  const orgRows = await db.select({ id: skills.orgId }).from(skills).groupBy(skills.orgId);
  for (const org of orgRows) {
    const skillRows = await db.select().from(skills).where(eq(skills.orgId, org.id));
    for (const skill of skillRows) {
      await ensureSkillPackage(org.id, skill);
      const files = await loadSkillFiles(org.id, skill.id);
      const hasReference = files.some((file) => file.kind === 'reference');
      if (!hasReference && /调研|研究/.test(skill.name)) {
        const content =
          '# 研究质量检查清单\n\n- 关键结论是否有两个独立来源？\n- 是否区分事实、推断与观点？\n- 是否给出反方观点与风险？\n- 建议是否有责任人与下一步？\n';
        await db.insert(skillFiles).values({
          id: newId('skf'),
          orgId: org.id,
          skillId: skill.id,
          path: 'references/checklist.md',
          kind: 'reference',
          mime: mimeOf('references/checklist.md'),
          size: Buffer.byteLength(content, 'utf8'),
          content,
        });
      }
      if (!hasReference && /写作|文档/.test(skill.name)) {
        const content =
          '# 写作风格指南\n\n- 结论先行，一段一个观点。\n- 标题层级不超过三级。\n- 数字口径与单位统一。\n- 交付前删除冗余形容词。\n';
        await db.insert(skillFiles).values({
          id: newId('skf'),
          orgId: org.id,
          skillId: skill.id,
          path: 'references/style-guide.md',
          kind: 'reference',
          mime: mimeOf('references/style-guide.md'),
          size: Buffer.byteLength(content, 'utf8'),
          content,
        });
      }

      const latestFiles = await loadSkillFiles(org.id, skill.id);
      const packages = latestFiles.map(toPackageFile);
      const manifest = {
        ...(skill.manifest || { tools: [] }),
        entry: 'SKILL.md',
        fileCount: latestFiles.length,
        packageSize: packages.reduce((sum, file) => sum + file.size, 0),
      };
      await db
        .update(skills)
        .set({ manifest, updatedAt: new Date() })
        .where(eq(skills.id, skill.id));

      if (skill.status === 'published') {
        const existingVersion = await db
          .select({ version: skillVersions.version })
          .from(skillVersions)
          .where(and(eq(skillVersions.orgId, org.id), eq(skillVersions.skillId, skill.id)))
          .limit(1);
        if (!existingVersion.length) {
          await db.insert(skillVersions).values({
            id: newId('skv'),
            orgId: org.id,
            skillId: skill.id,
            version: Math.max(1, skill.version || 1),
            snapshot: {
              name: skill.name,
              description: skill.description,
              type: skill.type,
              instructions: skill.instructions,
              manifest,
              entry: 'SKILL.md',
              files: packages,
              publishedAt: new Date().toISOString(),
            },
            createdBy: skill.createdBy,
          });
        }
      }
    }

    const existingApps = await db.select({ id: apps.id }).from(apps).where(eq(apps.orgId, org.id)).limit(1);
    if (!existingApps.length) {
      const expertRows = await db.select().from(experts).where(eq(experts.orgId, org.id));
      const pick = (name: string) => expertRows.find((expert) => expert.name === name);
      const definitions = [
        { name: '深度研究', description: '多源检索、交叉验证、结构化研究报告', category: '研究', icon: 'telescope', accent: '#22d3ee', expert: pick('深度研究员'), sortOrder: 10 },
        { name: '文档工作室', description: '把零散信息整理为可直接交付的正式文档', category: '写作', icon: 'file-text', accent: '#f59e0b', expert: pick('文档工程师'), sortOrder: 20 },
        { name: '数据分析', description: '指标拆解、归因分析与行动建议', category: '分析', icon: 'chart', accent: '#34d399', expert: pick('数据分析师'), sortOrder: 30 },
        { name: '日常助手', description: '问答、写作、分析与执行的通用入口', category: '通用', icon: 'spark', accent: '#7c6cff', expert: pick('通用助手') || expertRows[0], sortOrder: 40 },
      ].filter((item) => item.expert);
      if (definitions.length) {
        await db.insert(apps).values(
          definitions.map((item) => ({
            id: newId('app'),
            orgId: org.id,
            name: item.name,
            description: item.description,
            category: item.category,
            icon: item.icon,
            accent: item.accent,
            type: 'internal' as const,
            expertId: item.expert!.id,
            sortOrder: item.sortOrder,
            createdBy: item.expert!.createdBy,
          })),
        );
      }
    }
  }
  console.log(`[cuter backfill] 已补齐 ${orgRows.length} 个组织的技能包与应用`);
}

main().catch((err) => {
  console.error('[cuter backfill] 失败', err);
  process.exit(1);
});
