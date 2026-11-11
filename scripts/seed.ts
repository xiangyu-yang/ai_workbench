import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../src/server/db/client';
import {
  connectors,
  expertConnectors,
  experts,
  knowledgeBases,
  memberships,
  orgs,
  users,
} from '../src/server/db/schema';
import { newId } from '../src/server/ids';
import { hashPassword } from '../src/server/auth/password';
import { provisionOrg } from '../src/server/provision';
import { ingestDocument } from '../src/server/rag/ingest';

const DOCS: Array<{ name: string; content: string }> = [
  {
    name: '差旅与费用报销制度.md',
    content: `# 差旅与费用报销制度

## 一、适用范围
本制度适用于公司全体正式员工、实习生与外部顾问的因公出差及费用报销。

## 二、差旅标准
- 一线城市（北京、上海、深圳、广州）：住宿标准 600 元/晚，交通据实报销。
- 新一线城市：住宿标准 450 元/晚。
- 其他城市：住宿标准 350 元/晚。
- 总监及以上级别可上浮 30%，需在出差申请中注明。

## 三、审批流程
1. 出差前在系统提交申请，直属主管审批。
2. 跨境出差需部门负责人与财务负责人双重审批。
3. 单笔超过 5000 元的费用需提前提交预算说明。

## 四、报销时效
出差结束后 15 个工作日内提交报销单，逾期需附情况说明并经财务负责人审批。
发票抬头必须为公司全称，电子发票需上传原始 PDF。

## 五、常见问题
- 同行住宿：原则上不安排单间，特殊情况需说明。
- 改签退票：因公产生的改签费可报销，需附审批记录。
- 私车公用：按 1.2 元/公里计算，需提供行程记录。
`,
  },
  {
    name: 'Cuter 产品概览.md',
    content: `# Cuter AI 工作台产品概览

## 定位
Cuter 是面向集团企业的 AI 工作台：用自然语言下达目标，平台自主规划、调用企业能力、在受控环境中执行，并交付可验收的成果。

## 核心模块
1. **对话**：多模型流式对话，支持推理展示、工具调用、引用与交付物。
2. **任务**：后台异步执行，计划步骤可视、可审批、可定时。
3. **专家**：人格、模型、技能、知识库与工具策略的组合，可被委派。
4. **技能**：方法论指令包或 HTTP 工具，可版本化复用。
5. **连接器**：通过 MCP 接入企业系统，凭据加密、工具级治理。
6. **知识库**：文档解析、分块、嵌入与混合检索。

## 治理能力
- 组织/角色/邀请，最小权限原则
- 逐动作审批与完整审计
- 月度 token 配额与成本看板
- 模型密钥加密存储、访问掩码

## 部署形态
单机 PGlite 零依赖启动；生产切换 PostgreSQL，Web 与 Worker 分离水平扩展。
`,
  },
  {
    name: '客户支持响应手册.md',
    content: `# 客户支持响应手册（节选）

## 分级标准
- P0：核心服务不可用，影响全部客户。5 分钟内响应，30 分钟内给出进展。
- P1：主要功能受损或大客户受影响。15 分钟内响应，2 小时内给出方案。
- P2：局部功能异常，有替代方案。4 小时内响应。
- P3：咨询与建议。1 个工作日内响应。

## 响应模板
1. 确认收到并复述问题，给出工单号。
2. 说明当前判断与下一步动作，给出下一次同步时间。
3. 处理完成后输出根因、影响范围、修复动作与预防措施。

## 升级路径
一线支持 → 值班工程师 → 领域负责人 → CTO。P0 事件必须建立专属群并指定 Incident Commander。
`,
  },
];

async function main() {
  const db = await getDb();
  const email = 'admin@cuter.ai';

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length) {
    console.log('[cuter seed] 已存在种子账号，跳过');
    console.log('  账号: admin@cuter.ai / Cuter2026');
    process.exit(0);
  }

  const orgId = newId('org');
  const userId = newId('usr');
  const orgName = 'Cuter 演示组织';

  await db.insert(orgs).values({
    id: orgId,
    name: orgName,
    slug: `cuter-demo-${orgId.slice(-5)}`,
    plan: 'enterprise',
    tokenQuotaMonthly: 20_000_000,
    settings: { allowSignup: false },
  });

  await db.insert(users).values({
    id: userId,
    email,
    name: '乔治',
    passwordHash: await hashPassword('Cuter2026'),
    avatarColor: '#7c6cff',
  });

  await db.insert(memberships).values({
    id: newId('mem'),
    orgId,
    userId,
    role: 'owner',
  });

  await provisionOrg({ orgId, userId });

  const kbId = newId('kb');
  await db.insert(knowledgeBases).values({
    id: kbId,
    orgId,
    name: '组织制度与产品知识库',
    description: '差旅报销、客户支持流程与产品介绍等内部资料',
    chunkSize: 800,
    chunkOverlap: 100,
    createdBy: userId,
  });

  for (const doc of DOCS) {
    const buffer = Buffer.from(doc.content, 'utf8');
    const result = await ingestDocument({
      orgId,
      knowledgeBaseId: kbId,
      name: doc.name,
      mime: 'text/markdown',
      buffer,
    });
    console.log(`[cuter seed] 已入库 ${doc.name}（${result.chunkCount} 块）`);
  }

  // 绑定知识库到深度研究员
  const expertRows = await db.execute(
    sql`select id from experts where org_id = ${orgId} and name = '深度研究员' limit 1`,
  );
  const expertId = (expertRows as unknown as { rows?: Array<{ id: string }> }).rows?.[0]?.id;
  if (expertId) {
    await db.execute(
      sql`insert into expert_knowledge_bases (id, org_id, expert_id, knowledge_base_id, top_k) values (${newId('ekb')}, ${orgId}, ${expertId}, ${kbId}, 6) on conflict do nothing`,
    );
  }

  // 示例 MCP 连接器（本地进程），绑定给数据分析师，开箱即可体验工具调用与审批
  const connectorId = newId('con');
  await db.insert(connectors).values({
    id: connectorId,
    orgId,
    name: '示例工单系统',
    description: '演示 MCP：回显、当前时间、工单查询（stdio）',
    transport: 'stdio',
    command: 'node',
    args: ['scripts/demo-mcp.mjs'],
    enabled: true,
    createdBy: userId,
  });
  const analystRows = await db
    .select({ id: experts.id })
    .from(experts)
    .where(and(eq(experts.orgId, orgId), eq(experts.name, '数据分析师')))
    .limit(1);
  if (analystRows[0]) {
    await db.insert(expertConnectors).values({
      id: newId('ecn'),
      orgId,
      expertId: analystRows[0].id,
      connectorId,
      enabled: true,
    });
  }

  console.log('\n[cuter seed] 完成');
  console.log('  登录地址: http://localhost:3100/login');
  console.log('  账号: admin@cuter.ai');
  console.log('  密码: Cuter2026');
  process.exit(0);
}

void main().catch((err) => {
  console.error('[cuter seed] 失败', err);
  process.exit(1);
});
