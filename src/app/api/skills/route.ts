import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/server/db/client';
import { skillFiles, skills } from '@/server/db/schema';
import { newId } from '@/server/ids';
import { audit } from '@/server/audit';
import {
  ApiError,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  requireApi,
} from '@/server/http';
import { parseManifest } from '@/server/skills/validation';
import { composeSkillMarkdown, mimeOf } from '@/server/skills/package';

const SkillBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  type: z.enum(['instruction', 'http']).default('instruction'),
  icon: z.string().max(40).default('wand'),
  category: z.string().max(40).default('通用'),
  instructions: z.string().max(30_000).default(''),
  manifest: z.unknown().optional(),
  visibility: z.enum(['private', 'team', 'public']).default('team'),
  template: z.enum(['blank', 'research', 'writing', 'data']).default('blank'),
});

const TEMPLATES = {
  blank: (name: string) =>
    `# ${name}\n\n## 适用场景\n\n描述这个技能解决的问题与触发条件。\n\n## 工作流程\n1. 明确输入与验收标准。\n2. 按步骤执行，记录关键判断。\n3. 输出结构化结果并自检。\n\n## 输出规范\n\n- 结论先行\n- 标注假设与不确定项\n- 给出可执行的下一步\n`,
  research: (name: string) =>
    `# ${name}\n\n## 适用场景\n\n需要多源检索、交叉验证与结构化结论的研究任务。\n\n## 工作流程\n1. 界定决策问题、对象与时间范围。\n2. 用 MECE 拆解 3-5 个分析维度。\n3. 优先检索组织知识库，再补充公开来源。\n4. 关键结论至少两个独立来源，标注日期与置信度。\n5. 输出摘要 → 关键发现 → 证据 → 风险 → 建议。\n\n## 质量检查\n\n- 事实、推断、观点是否分开？\n- 每个数字是否有来源？\n- 是否呈现反方观点？\n`,
  writing: (name: string) =>
    `# ${name}\n\n## 适用场景\n\n把零散信息整理为可直接交付的正式文档。\n\n## 工作流程\n1. 确认读者、用途、篇幅与语气。\n2. 先写一页纸摘要：背景、结论、下一步。\n3. 正文使用金字塔结构，每段只表达一个观点。\n4. 统一术语、数字口径与格式。\n\n## 输出规范\n\n- 结论先行\n- 表格用于对比，列表用于并列\n- 不确定处标注【待补充】\n`,
  data: (name: string) =>
    `# ${name}\n\n## 适用场景\n\n指标拆解、归因分析与数据洞察。\n\n## 工作流程\n1. 明确指标口径、数据范围与对比基准。\n2. 选择漏斗、同期群或贡献度拆解。\n3. 区分相关性与因果性，给出置信度。\n4. 输出关键发现（3 条以内）→ 证据 → 建议动作。\n\n## 脚本\n\n可在 scripts/ 下放置可复用分析脚本；执行需人工审批。\n`,
};

export async function GET() {
  try {
    const auth = await requireApi('viewer');
    const db = await getDb();
    const rows = await db
      .select()
      .from(skills)
      .where(eq(skills.orgId, auth.org.id))
      .orderBy(asc(skills.createdAt));
    return json({ skills: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const auth = await requireApi('member');
    const input = SkillBody.parse(await readJson(req));
    const manifest = parseManifest(input.manifest);
    if (input.type === 'http' && !manifest.tools.length) {
      throw new ApiError(422, 'HTTP 技能至少需要一个工具定义');
    }

    const body = input.instructions?.trim() || TEMPLATES[input.template](input.name);
    const skillMd = composeSkillMarkdown({
      name: input.name,
      description: input.description || `${input.name} 技能`,
      body,
      category: input.category,
    });
    const files: Array<{ path: string; content: string; kind: 'skill' | 'reference' }> = [
      { path: 'SKILL.md', content: skillMd, kind: 'skill' },
    ];
    if (input.template === 'research') {
      files.push({
        path: 'references/checklist.md',
        kind: 'reference',
        content:
          '# 研究质量检查清单\n\n- 问题边界是否清晰？\n- 关键数据是否有两个独立来源？\n- 是否区分事实、推断与观点？\n- 是否给出反方观点与风险？\n- 建议是否可执行、有责任人？\n',
      });
    } else if (input.template === 'writing') {
      files.push({
        path: 'references/style-guide.md',
        kind: 'reference',
        content:
          '# 写作风格指南\n\n- 结论先行，一段一个观点。\n- 标题层级不超过三级。\n- 术语首次出现时给出定义。\n- 数字保留统一口径与单位。\n- 交付前朗读一遍，删除冗余形容词。\n',
      });
    } else if (input.template === 'data') {
      files.push({
        path: 'references/metrics.md',
        kind: 'reference',
        content:
          '# 指标口径模板\n\n| 指标 | 定义 | 数据源 | 更新频率 | 负责人 |\n| --- | --- | --- | --- | --- |\n| 待补充 | 待补充 | 待补充 | 每日 | 待补充 |\n',
      });
    }
    const packageSize = files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf8'), 0);
    const db = await getDb();
    const id = newId('skl');
    await db.insert(skills).values({
      id,
      orgId: auth.org.id,
      name: input.name,
      description: input.description,
      type: input.type,
      icon: input.icon,
      category: input.category,
      instructions: body,
      manifest: {
        ...manifest,
        entry: 'SKILL.md',
        fileCount: files.length,
        packageSize,
      },
      visibility: input.visibility,
      createdBy: auth.user.id,
    });
    await db.insert(skillFiles).values(
      files.map((file) => ({
        id: newId('skf'),
        orgId: auth.org.id,
        skillId: id,
        path: file.path,
        kind: file.kind,
        mime: mimeOf(file.path),
        size: Buffer.byteLength(file.content, 'utf8'),
        encoding: 'utf8' as const,
        content: file.content,
      })),
    );
    await audit(
      { orgId: auth.org.id, actorId: auth.user.id, ip: auth.ip },
      'skill.create',
      { type: 'skill', id },
      { name: input.name, type: input.type, files: files.length },
    );
    return json({ ok: true, id }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
