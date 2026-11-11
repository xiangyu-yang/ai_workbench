import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/server/db/client';
import { apps, expertSkills, experts, skillFiles, skillVersions, skills } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { composeSkillMarkdown, loadSkillFiles, mimeOf, toPackageFile } from '@/server/skills/package';

const RESEARCH_SKILL = `## 深度调研方法
1. **界定问题**：明确决策问题、对象、时间范围与成功标准。
2. **搭建框架**：用 MECE 拆解 3-5 个分析维度，避免遗漏与重复。
3. **多源取证**：优先一手资料（文档、数据、访谈），其次权威二手资料，标注来源与日期。
4. **交叉验证**：关键结论至少两个独立来源；矛盾时呈现分歧并说明置信度。
5. **输出结构**：结论先行 → 关键证据 → 风险与反方观点 → 行动建议。
6. **引用规范**：每个事实性论断后用 [n] 标注来源，不使用无法核实的数字。`;

const WRITING_SKILL = `## 结构化写作规范
- 先写"一页纸摘要"：背景一句话、结论三条、下一步三条。
- 正文采用金字塔结构：结论 → 论据 → 事实。
- 每段只表达一个观点，首句即主旨。
- 表格用于对比，列表用于并列，避免连续大段文字。
- 交付前自检：术语一致、数字口径一致、时间与责任人明确。`;

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

  const skillResearchId = newId('skl');
  const skillWritingId = newId('skl');
  const researchMd = composeSkillMarkdown({
    name: '深度调研方法论',
    description: '多源取证、交叉验证、结论先行的研究方法',
    body: RESEARCH_SKILL,
    version: '1.0.0',
    category: '研究',
    allowedTools: ['knowledge_search', 'web_search', 'read_url'],
  });
  const writingMd = composeSkillMarkdown({
    name: '结构化写作规范',
    description: '金字塔结构、一页纸摘要、交付前自检',
    body: WRITING_SKILL,
    version: '1.0.0',
    category: '写作',
    allowedTools: ['workspace_write', 'workspace_read'],
  });
  await db.insert(skills).values([
    {
      id: skillResearchId,
      orgId: params.orgId,
      name: '深度调研方法论',
      description: '多源取证、交叉验证、结论先行的研究方法',
      type: 'instruction',
      icon: 'telescope',
      category: '研究',
      instructions: RESEARCH_SKILL,
      manifest: {
        tools: [],
        entry: 'SKILL.md',
        fileCount: 2,
        packageSize: Buffer.byteLength(researchMd, 'utf8') + Buffer.byteLength('# 研究质量检查清单\n\n- 关键结论是否有两个独立来源？\n- 是否区分事实、推断与观点？\n- 是否给出反方观点与风险？\n', 'utf8'),
      },
      status: 'published',
      visibility: 'public',
      createdBy: params.userId,
    },
    {
      id: skillWritingId,
      orgId: params.orgId,
      name: '结构化写作规范',
      description: '金字塔结构、一页纸摘要、交付前自检',
      type: 'instruction',
      icon: 'pen',
      category: '写作',
      instructions: WRITING_SKILL,
      manifest: {
        tools: [],
        entry: 'SKILL.md',
        fileCount: 2,
        packageSize: Buffer.byteLength(writingMd, 'utf8') + Buffer.byteLength('# 写作风格指南\n\n- 结论先行\n- 一段一个观点\n- 数字口径一致\n', 'utf8'),
      },
      status: 'published',
      visibility: 'public',
      createdBy: params.userId,
    },
  ]);
  await db.insert(skillFiles).values([
    {
      id: newId('skf'),
      orgId: params.orgId,
      skillId: skillResearchId,
      path: 'SKILL.md',
      kind: 'skill',
      mime: 'text/markdown',
      size: Buffer.byteLength(researchMd, 'utf8'),
      content: researchMd,
    },
    {
      id: newId('skf'),
      orgId: params.orgId,
      skillId: skillResearchId,
      path: 'references/checklist.md',
      kind: 'reference',
      mime: mimeOf('references/checklist.md'),
      size: Buffer.byteLength('# 研究质量检查清单\n\n- 关键结论是否有两个独立来源？\n- 是否区分事实、推断与观点？\n- 是否给出反方观点与风险？\n', 'utf8'),
      content: '# 研究质量检查清单\n\n- 关键结论是否有两个独立来源？\n- 是否区分事实、推断与观点？\n- 是否给出反方观点与风险？\n',
    },
    {
      id: newId('skf'),
      orgId: params.orgId,
      skillId: skillWritingId,
      path: 'SKILL.md',
      kind: 'skill',
      mime: 'text/markdown',
      size: Buffer.byteLength(writingMd, 'utf8'),
      content: writingMd,
    },
    {
      id: newId('skf'),
      orgId: params.orgId,
      skillId: skillWritingId,
      path: 'references/style-guide.md',
      kind: 'reference',
      mime: mimeOf('references/style-guide.md'),
      size: Buffer.byteLength('# 写作风格指南\n\n- 结论先行\n- 一段一个观点\n- 数字口径一致\n', 'utf8'),
      content: '# 写作风格指南\n\n- 结论先行\n- 一段一个观点\n- 数字口径一致\n',
    },
  ]);

  const generalId = newId('exp');
  const researcherId = newId('exp');
  const docId = newId('exp');
  const analystId = newId('exp');

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

  await db.insert(apps).values([
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

  const researchFiles = (await loadSkillFiles(params.orgId, skillResearchId)).map(toPackageFile);
  const writingFiles = (await loadSkillFiles(params.orgId, skillWritingId)).map(toPackageFile);
  await db.insert(skillVersions).values([
    {
      id: newId('skv'),
      orgId: params.orgId,
      skillId: skillResearchId,
      version: 1,
      snapshot: {
        name: '深度调研方法论',
        description: '多源取证、交叉验证、结论先行的研究方法',
        type: 'instruction',
        instructions: RESEARCH_SKILL,
        manifest: { tools: [], entry: 'SKILL.md', fileCount: researchFiles.length },
        entry: 'SKILL.md',
        files: researchFiles,
        publishedAt: new Date().toISOString(),
      },
      createdBy: params.userId,
    },
    {
      id: newId('skv'),
      orgId: params.orgId,
      skillId: skillWritingId,
      version: 1,
      snapshot: {
        name: '结构化写作规范',
        description: '金字塔结构、一页纸摘要、交付前自检',
        type: 'instruction',
        instructions: WRITING_SKILL,
        manifest: { tools: [], entry: 'SKILL.md', fileCount: writingFiles.length },
        entry: 'SKILL.md',
        files: writingFiles,
        publishedAt: new Date().toISOString(),
      },
      createdBy: params.userId,
    },
  ]);

  await db.insert(expertSkills).values([
    {
      id: newId('esk'),
      orgId: params.orgId,
      expertId: researcherId,
      skillId: skillResearchId,
      version: 0,
      enabled: true,
    },
    {
      id: newId('esk'),
      orgId: params.orgId,
      expertId: docId,
      skillId: skillWritingId,
      version: 0,
      enabled: true,
    },
  ]);

  // 默认专家写入组织设置，供新会话快速选择
  await db.execute(
    sql`update orgs set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('defaultExpertId', ${generalId}::text) where id = ${params.orgId}`,
  );
}
