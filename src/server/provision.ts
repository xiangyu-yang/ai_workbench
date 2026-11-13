import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { apps, experts } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { bindSeedSkills, installSkillLibrary } from '@/server/skills/install';
import { STOCK_ADVISOR, STOCK_APP } from '@/server/experts/stock';

const ANALYST_PROMPT = `你是组织内的数据分析师，擅长把模糊问题转为可验证的分析框架。
工作方式：
1. 先澄清指标口径、数据范围与对比基准；无法获得数据时明确说明假设。
2. 使用结构化框架（如漏斗、同期群、贡献度拆解）定位问题。
3. 结论必须附证据与计算过程，区分相关性和因果性。
4. 输出：关键发现（3 条以内）→ 证据 → 建议动作 → 需要的补充数据。`;

const DOC_ENGINEER_PROMPT = `你是组织内的文档工程师，擅长把零散信息整理为可直接使用的正式材料。
工作方式：
1. 先确认读者、用途、篇幅与语气；缺失时采用"面向管理层、正式、精炼"的默认设定。
2. 输出结构清晰、可直接交付的文档，写入工作区生成 .md 交付物。
3. 保留事实与引用，不编造数据；不确定处用【待补充】标注。
4. 交付后给出 2-3 条使用建议。`;

const RESEARCHER_PROMPT = `你是组织内的深度研究员，擅长调研、竞品分析与方案论证。
工作方式：
1. 先拆解研究问题，明确边界与决策用途。
2. 制定检索计划：知识库优先，其次公开信息；关键数据交叉验证。
3. 区分事实、推断与观点，标注来源与时间。
4. 输出研究报告时写入工作区，结构为：摘要 → 关键发现 → 证据 → 风险 → 建议。`;

export async function provisionOrg(params: {
  orgId: string;
  userId: string;
}): Promise<void> {
  const db = await getDb();
  const existing = await db
    .select({ id: experts.id })
    .from(experts)
    .where(eq(experts.orgId, params.orgId))
    .limit(1);
  if (existing.length) return;

  await installSkillLibrary(params.orgId, params.userId);

  const generalId = newId('exp');
  const researcherId = newId('exp');
  const docId = newId('exp');
  const analystId = newId('exp');
  const stockAdvisorId = newId('exp');

  await db.insert(experts).values([
    {
      id: generalId,
      orgId: params.orgId,
      name: '通用助手',
      description: '日常问答、写作、分析与执行，默认自动调用只读工具',
      icon: 'spark',
      accent: '#7c6cff',
      category: '通用',
      systemPrompt:
        '你是组织内的通用 AI 助手。优先理解真实意图，给出可执行的答案；需要产出材料时生成交付物。',
      temperature: 0.4,
      maxSteps: 8,
      toolPolicy: 'never',
      defaultMode: 'agent',
      visibility: 'public',
      createdBy: params.userId,
    },
    {
      id: researcherId,
      orgId: params.orgId,
      name: '深度研究员',
      description: '多源检索、交叉验证、结构化研究报告',
      icon: 'telescope',
      accent: '#22d3ee',
      category: '研究',
      systemPrompt: RESEARCHER_PROMPT,
      temperature: 0.3,
      maxSteps: 14,
      toolPolicy: 'dangerous',
      defaultMode: 'agent',
      visibility: 'public',
      createdBy: params.userId,
    },
    {
      id: docId,
      orgId: params.orgId,
      name: '文档工程师',
      description: '把零散信息整理为可直接交付的正式文档',
      icon: 'file-text',
      accent: '#f59e0b',
      category: '写作',
      systemPrompt: DOC_ENGINEER_PROMPT,
      temperature: 0.5,
      maxSteps: 8,
      toolPolicy: 'dangerous',
      defaultMode: 'agent',
      visibility: 'public',
      createdBy: params.userId,
    },
    {
      id: analystId,
      orgId: params.orgId,
      name: '数据分析师',
      description: '指标拆解、归因分析、数据洞察与建议',
      icon: 'chart',
      accent: '#34d399',
      category: '分析',
      systemPrompt: ANALYST_PROMPT,
      temperature: 0.2,
      maxSteps: 10,
      toolPolicy: 'dangerous',
      defaultMode: 'agent',
      visibility: 'public',
      createdBy: params.userId,
    },
  ]);

  await db.insert(experts).values([
    {
      ...STOCK_ADVISOR,
      id: stockAdvisorId,
      orgId: params.orgId,
      createdBy: params.userId,
    },
  ]);

  await db.insert(apps).values([
    {
      ...STOCK_APP,
      id: newId('app'),
      orgId: params.orgId,
      expertId: stockAdvisorId,
      createdBy: params.userId,
    },
    {
      id: newId('app'),
      orgId: params.orgId,
      name: '深度研究',
      description: '多源检索、交叉验证、结构化研究报告',
      category: '研究',
      icon: 'telescope',
      accent: '#22d3ee',
      type: 'internal',
      expertId: researcherId,
      sortOrder: 10,
      createdBy: params.userId,
    },
    {
      id: newId('app'),
      orgId: params.orgId,
      name: '文档工作室',
      description: '把零散信息整理为可直接交付的正式文档',
      category: '写作',
      icon: 'file-text',
      accent: '#f59e0b',
      type: 'internal',
      expertId: docId,
      sortOrder: 20,
      createdBy: params.userId,
    },
    {
      id: newId('app'),
      orgId: params.orgId,
      name: '数据分析',
      description: '指标拆解、归因分析与行动建议',
      category: '分析',
      icon: 'chart',
      accent: '#34d399',
      type: 'internal',
      expertId: analystId,
      sortOrder: 30,
      createdBy: params.userId,
    },
    {
      id: newId('app'),
      orgId: params.orgId,
      name: '日常助手',
      description: '问答、写作、分析与执行的通用入口',
      category: '通用',
      icon: 'spark',
      accent: '#7c6cff',
      type: 'internal',
      expertId: generalId,
      sortOrder: 40,
      createdBy: params.userId,
    },
  ]);

  await bindSeedSkills(params.orgId);

  // 默认专家写入组织设置，供新会话快速选择
  await db.execute(
    sql`update orgs set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('defaultExpertId', ${generalId}::text) where id = ${params.orgId}`,
  );
}
