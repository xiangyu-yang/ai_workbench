/**
 * 组织内置技能库。
 *
 * 设计参考：
 * - Anthropic Agent Skills 开放规范：SKILL.md + references/ + scripts/ + assets/，渐进式披露；
 * - WorkBuddy 技能市场：SKILL.md 负责触发，references 承载领域知识，scripts 执行确定性计算；
 * - 社区实践：脚本只做可验证的机械工作，判断与写作仍由模型完成。
 *
 * 每个技能必须同时具备：SKILL.md、至少一个 reference、至少一个 script、至少一个 asset。
 */

export type SkillSeedFile = {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
};

export type SkillDefinition = {
  name: string;
  description: string;
  category: string;
  icon: string;
  version: string;
  license: string;
  allowedTools: string[];
  body: string;
  files: SkillSeedFile[];
  bindTo: string[];
};

import { STOCK_SKILL } from './stock-skill';

const text = (path: string, content: string): SkillSeedFile => ({ path, content });

/* ─────────────────────────── 1. 周报生成器 ─────────────────────────── */

const WEEKLY_REPORT_BODY = `# 周报生成器

## 何时使用

当用户需要根据本周工作记录、项目进展或指标数据生成周报、月报、双周报、管理层汇报时使用。典型触发：
- “把这周的进展整理成周报”
- “给老板写一份项目月报，重点讲风险和资源”
- “把这些指标做成带环比的管理层摘要”

如果用户只是问一个事实，不要触发本技能。

## 目标

把零散的工作记录整理成**可决策**的汇报：结论先行、数据有口径、风险有责任人、下周有计划。

## 输入清单

先检查以下信息，缺失时按默认值处理并明确标注假设：
1. 汇报周期与对比周期（默认本周 vs 上周）
2. 汇报对象（管理层 / 项目组 / 客户 / 个人）
3. 项目或业务线
4. 关键指标（当前值、上期值、目标值、单位、口径）
5. 本周完成事项、未完成事项、风险与阻塞
6. 下周计划与需要支持

## 工作流

1. **确认视角**：管理层看结论、指标、风险与资源；项目组看任务、依赖与排期。默认“管理层、正式、一页纸 + 附录”。
2. **处理指标**：如果用户提供 CSV/JSON 指标数据，先写入工作区，再调用技能脚本做环比、目标达成与异常标记：
   - 工具：run_skill_script
   - skill：周报生成器
   - script：scripts/aggregate_metrics.mjs
   - args：["--format","markdown"]
   - inputPath：工作区中的 metrics.csv；或 inputText 直接传 CSV 文本
   脚本会输出 Markdown 表格与异常列表，不要自己心算后编造数字。
3. **组织结构**：读取 references/report-template.md，按“摘要 → 指标 → 进展 → 风险 → 下周计划 → 需要支持”组织。
4. **写成交付物**：使用 workspace_write 写入 Markdown 文件，文件名包含周期，例如 2026-W46-周报.md。
5. **自检**：逐条对照 references/quality-checklist.md，确认数字、日期、责任人、口径。

## 输出规范

- 摘要不超过 5 条，每条以结论开头，不用“持续推进”这类空话。
- 指标必须带：当前值、对比值、变化、目标达成、统计口径。
- 风险必须带：影响、概率/紧迫度、责任人、下一步。
- 下周计划必须带：事项、负责人、时间点、验收标准。
- 没有数据时写“暂无数据/待补充”，不要估算。
- 不替用户补全指标定义、统计口径或汇报周期；用户写“活跃用户”就保留原名，不要擅自改写成 DAU/MAU，也不要把周报写成月报。

## 质量门槛

- 每个数字都能追溯到用户输入或脚本输出。
- 同一指标在全文中口径一致。
- 不把“过程”当“结果”：区分已完成、进行中、未开始。
- 不把风险写成流水账，必须给出应对动作。

## 包内资源

- references/report-template.md：周报结构与写作要点
- references/quality-checklist.md：交付前检查清单
- references/metrics-glossary.md：常见指标口径与异常判断
- scripts/aggregate_metrics.mjs：CSV/JSON 指标聚合、环比、目标达成、异常标记
- assets/weekly-report-template.md：可直接填充的周报模板
- assets/weekly-report.css：HTML/PDF 导出时的打印样式
- assets/metrics-sample.csv：示例指标数据（用于演示脚本）

## 脚本约定

脚本从 SKILL_INPUT 或 --input 读取 CSV/JSON；CSV 列名为 metric,current,previous,target,unit,owner。输出 Markdown 或 JSON。脚本只做计算和格式化，不做业务判断。
`;

const WEEKLY_METRICS_GLOSSARY = `# 指标口径手册

## 通用规则

- **时间范围**：明确“本周”是自然周、滚动 7 天还是财周；默认自然周（周一至周日）。
- **对比基准**：环比 vs 上周，同比 vs 去年同期；不要混用。
- **单位**：金额统一人民币元/万元，比例统一百分数，次数统一“次”。
- **去重口径**：用户数按去重用户 ID，订单按订单号，工单按工单号。
- **缺失值**：不要用 0 代替缺失；标注“暂无数据”。

## 常见指标

| 指标 | 口径 | 异常信号 |
| --- | --- | --- |
| 活跃用户 | 周期内至少一次核心行为的去重用户 | 环比下降 >10% 或连续 2 周下降 |
| 新增用户 | 首次注册/激活的去重用户 | 渠道结构突变、成本异常升高 |
| 转化率 | 完成目标行为人数 / 进入漏斗人数 | 单环节下降 >20% 需要拆分 |
| 留存率 | 同期群在第 N 天仍活跃的比例 | 次日/7 日留存同时下降 |
| 客单价 | 成交金额 / 成交订单数 | 结构变化而非价格变化导致 |
| 工单解决时长 | 从创建到关闭的中位时长 | P0/P1 超 SLA 或长尾恶化 |
| 毛利率 | (收入 - 直接成本) / 收入 | 成本项异常或口径变化 |

## 常见错误

1. 把累计值当周期值。
2. 分母变化导致比率失真，却没有同时给出分子分母。
3. 只报“增长 20%”，不报基数和绝对值。
4. 目标和实际口径不一致（例如目标按自然月、实际按滚动 30 天）。

## 异常判断建议

- 变化幅度不是唯一标准：同时看绝对值、持续性、影响面和可解释性。
- 指标异常时先拆维度（渠道、地区、客群、版本、时间），再判断是真实变化还是数据问题。
- 涉及归因时区分“相关”与“因果”，不要只给单一原因。
`;

const WEEKLY_TEMPLATE = `# {{周期}} 周报

> 汇报人：{{姓名}} ｜ 汇报对象：{{对象}} ｜ 数据口径：{{口径}}

## 一、摘要

1. {{结论一：完成了什么，带来什么结果}}
2. {{结论二：关键指标变化与原因}}
3. {{结论三：最大风险与需要的支持}}

## 二、关键指标

| 指标 | 本周 | 上周 | 变化 | 目标 | 达成 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| {{指标}} | {{值}} | {{值}} | {{±%}} | {{目标}} | {{%}} | {{口径/原因}} |

## 三、项目进展

### {{项目 A}}

- 本周完成：
- 当前状态：
- 关键产出：
- 未完成及原因：

### {{项目 B}}

- 本周完成：
- 当前状态：
- 关键产出：
- 未完成及原因：

## 四、风险与阻塞

| 风险 | 影响 | 紧迫度 | 责任人 | 应对动作 | 需要支持 |
| --- | --- | --- | --- | --- | --- |
| {{风险}} | {{影响}} | 高/中/低 | {{姓名}} | {{动作}} | {{支持}} |

## 五、下周计划

| 事项 | 负责人 | 时间点 | 验收标准 |
| --- | --- | --- | --- |
| {{事项}} | {{姓名}} | {{日期}} | {{可验收结果}} |

## 六、需要支持

- {{需要谁在什么时间前提供什么支持}}
`;

const WEEKLY_CHECKLIST = `# 周报交付检查清单

- [ ] 周期、对比周期、数据口径明确
- [ ] 摘要 3-5 条，每条是结论而非过程
- [ ] 每个指标有当前值、对比、目标、单位
- [ ] 变化超过阈值的指标有解释，没有编造原因
- [ ] 项目状态区分已完成 / 进行中 / 未开始
- [ ] 风险有责任人、影响、应对动作
- [ ] 下周计划有负责人、时间点、验收标准
- [ ] 需要支持写到“谁、何时、做什么”
- [ ] 全文日期、数字、专有名词一致
- [ ] 没有擅自改写指标名、口径或汇报周期
- [ ] 已写入工作区并给出文件名
`;

const WEEKLY_CSS = `/* Cuter 周报打印样式：用于浏览器打印或转 PDF */
:root { --ink: #1a1d24; --muted: #5b6472; --line: #d9dee7; --accent: #5b4bdb; }
* { box-sizing: border-box; }
body { margin: 0; padding: 40px; color: var(--ink); font: 14px/1.8 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
h1 { font-size: 26px; margin: 0 0 8px; }
h2 { font-size: 18px; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 2px solid var(--accent); }
h3 { font-size: 15px; margin: 18px 0 8px; }
blockquote { margin: 0 0 20px; color: var(--muted); border-left: 3px solid var(--accent); padding-left: 12px; }
table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; font-size: 12.5px; }
th, td { border: 1px solid var(--line); padding: 8px 10px; text-align: left; vertical-align: top; }
th { background: #f4f5fa; font-weight: 600; }
ul, ol { padding-left: 22px; }
@media print { body { padding: 0; } h2 { break-after: avoid; } table { break-inside: avoid; } }
`;

const WEEKLY_SAMPLE = `metric,current,previous,target,unit,owner
活跃用户,12840,11920,13500,人,增长组
新增注册,1820,2100,1600,人,增长组
付费转化率,4.8,4.2,5.0,%,商业化
客单价,268,255,280,元,商业化
工单解决时长,6.4,7.1,6.0,小时,客服
P1超时工单,3,1,0,单,客服
`;

const AGGREGATE_METRICS_SCRIPT = String.raw`#!/usr/bin/env node
/**
 * 指标聚合：读取 CSV/JSON，计算环比、目标达成和异常标记。
 * 用法：
 *   node aggregate_metrics.mjs --input metrics.csv --format markdown
 *   SKILL_INPUT=/path/metrics.csv node aggregate_metrics.mjs --format json
 */
import fs from 'node:fs';

function parseArgs(argv) {
  const out = { format: 'markdown', threshold: 10 };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--input') out.input = argv[++i];
    else if (key === '--format') out.format = argv[++i];
    else if (key === '--threshold') out.threshold = Number(argv[++i]);
    else if (key === '--period') out.period = argv[++i];
  }
  return out;
}

function parseCsv(raw) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell);
  if (row.some((item) => item.length)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).filter((r) => r.some((v) => v.trim())).map((r) => {
    const item = {};
    headers.forEach((h, idx) => { item[h] = (r[idx] || '').trim(); });
    return item;
  });
}

function num(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/%$/, ''));
  return Number.isFinite(n) ? n : null;
}

function pct(value) {
  if (value === null) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(1) + '%';
}

function main() {
  const args = parseArgs(process.argv);
  const input = args.input || process.env.SKILL_INPUT || '';
  if (!input) {
    console.error('缺少输入：使用 --input 或 SKILL_INPUT');
    process.exit(2);
  }
  const raw = fs.readFileSync(input, 'utf8');
  const rows = input.toLowerCase().endsWith('.json') ? JSON.parse(raw) : parseCsv(raw);
  const list = Array.isArray(rows) ? rows : rows.metrics || [];
  const result = list.map((item) => {
    const current = num(item.current);
    const previous = num(item.previous);
    const target = num(item.target);
    const delta = current !== null && previous !== null && previous !== 0
      ? ((current - previous) / Math.abs(previous)) * 100
      : null;
    const attainment = current !== null && target !== null && target !== 0
      ? (current / target) * 100
      : null;
    let status = current === null ? 'missing' : 'on_track';
    if (delta !== null && Math.abs(delta) >= args.threshold) status = delta > 0 ? 'watch_up' : 'watch_down';
    if (attainment !== null && attainment < 90) status = 'off_target';
    return {
      metric: item.metric || item.name || '',
      current: current === null ? '—' : current,
      previous: previous === null ? '—' : previous,
      target: target === null ? '—' : target,
      unit: item.unit || '',
      owner: item.owner || '',
      deltaPct: delta,
      attainmentPct: attainment,
      status,
    };
  });

  if (args.format === 'json') {
    console.log(JSON.stringify({ period: args.period || null, thresholdPct: args.threshold, rows: result }, null, 2));
    return;
  }

  const lines = [];
  lines.push('| 指标 | 当前 | 上期 | 变化 | 目标 | 达成 | 负责人 | 状态 |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const item of result) {
    lines.push('| ' + item.metric + ' | ' + item.current + ' ' + item.unit + ' | ' + item.previous + ' ' + item.unit + ' | ' + pct(item.deltaPct) + ' | ' + item.target + ' ' + item.unit + ' | ' + (item.attainmentPct === null ? '—' : item.attainmentPct.toFixed(0) + '%') + ' | ' + (item.owner || '—') + ' | ' + item.status + ' |');
  }
  const watch = result.filter((item) => item.status.startsWith('watch') || item.status === 'off_target');
  lines.push('');
  lines.push('**需关注**：' + (watch.length ? watch.map((item) => item.metric + '(' + item.status + ')').join('、') : '无'));
  console.log(lines.join('\n'));
}

main();
`;

/* ─────────────────────────── 2. 数据分析与洞察 ─────────────────────────── */

const DATA_INSIGHT_BODY = `# 数据分析与洞察

## 何时使用

当用户提供 CSV/Excel 导出数据，或要求分析增长、漏斗、留存、转化、异常、贡献度、同期群时使用。典型触发：
- “帮我看看这份销售数据有什么问题”
- “为什么本周转化率下降了”
- “按渠道拆解一下新增用户质量”

不适用于纯概念解释；如果只是问指标定义，直接回答并引用 references/metrics-glossary.md。

## 工作流

1. **把问题变成假设**：明确决策问题、指标口径、时间范围、对比基准、期望动作。
2. **先做数据体检**：把 CSV 写入工作区，调用 scripts/profile_dataset.py 做字段、缺失、唯一值、数值分布和 Top 值检查。
   - 工具：run_skill_script；script：scripts/profile_dataset.py
   - 通过 inputPath 引用工作区文件，或 inputText 传最多 20k 字符
3. **选择分析框架**：按 references/analysis-playbook.md 选择漏斗、贡献度拆解、同期群、对比分析或异常归因。
4. **计算与验证**：用脚本或明确的手算步骤；检查分母、重复、极端值、口径漂移；重要结论做至少一次交叉验证。
5. **输出洞察**：按 references/insight-standards.md 写“结论 → 证据 → 解释 → 建议 → 局限”。
6. **交付**：用 assets/insight-memo-template.md 生成 Markdown，写入工作区。

## 输出规范

- 先给 1-3 条关键发现，每条包含影响量级。
- 每个数字给出计算口径与分母；不要只写百分比。
- 区分事实、推断、假设；推断要标注置信度。
- 归因至少给出两种可能解释，并说明如何验证。
- 建议必须具体到动作、对象、时间。

## 质量门槛

- 不编造数据；缺失就写缺失。
- 不把相关当因果。
- 不用平均数掩盖分布（必要时给中位数/分位数）。
- 检查幸存者偏差、辛普森悖论、选择偏差。

## 包内资源

- references/analysis-playbook.md：分析框架与追问清单
- references/metrics-glossary.md：常用指标口径
- references/insight-standards.md：洞察写作与证据标准
- scripts/profile_dataset.py：CSV 数据体检
- assets/insight-memo-template.md：洞察备忘录模板
- assets/chart-spec.json：图表选择与字段映射建议
`;

const ANALYSIS_PLAYBOOK = `# 分析框架手册

## 先问五个问题

1. 这个分析要支持什么决策？
2. 指标的精确定义、分母和去重口径是什么？
3. 对比基准是什么（上周、上月、目标、对照组）？
4. 数据覆盖的时间、渠道、客群是否完整？
5. 结论如果成立，应该看到什么伴随现象？

## 常用框架

### 漏斗分析
- 拆成 3-6 个互斥环节，给出每步转化率与流失量。
- 先看绝对流失，再看相对转化；分母变化要同时报告。
- 按渠道/版本/客群拆分，寻找结构性差异。

### 贡献度拆解
- 总变化 = Σ(各分组变化)；识别最大正/负贡献。
- 注意组结构变化（Mix Shift）与组内变化（Rate Change）的区别。
- 用加权公式复核，避免比例相加。

### 同期群
- 按首次行为时间分组，比较同一生命周期阶段的留存/付费。
- 不同 cohort 的获客渠道、活动、产品版本要一起看。

### 异常归因
1. 先确认数据是否真实（埋点、重复、延迟、口径变更）。
2. 再拆维度（时间、渠道、地区、版本、客群）。
3. 最后验证机制（产品变更、运营活动、外部事件）。
4. 给出可证伪的验证方法。

## 常见陷阱

- 平均数陷阱：收入、时长、客单价通常长尾。
- 辛普森悖论：分组趋势与总体趋势相反。
- 生存者偏差：只分析留下来的用户。
- 分母漂移：转化率变化来自分母而非分子。
- 多重比较：反复切维度直到显著。

## 输出前自检

- 每个结论有数字和口径。
- 至少一个反方解释。
- 建议与发现一一对应。
- 数据局限写清楚。
`;

const INSIGHT_STANDARDS = `# 洞察写作标准

## 一条好洞察的结构

**结论**：一句话说明发生了什么、影响多大。
**证据**：关键数字、对比、拆分。
**解释**：为什么发生；区分已验证与待验证。
**建议**：谁在什么时间做什么，预期影响。
**局限**：数据缺口、口径风险、可能反例。

## 反模式

- “数据表明用户很喜欢”：没有指标、没有对比。
- “建议优化体验”：不可执行。
- 只给图表不给结论；只给结论不给证据。
- 用“显著”但没有统计或业务阈值。
- 把相关性写成因果。

## 置信度标注

- 高：多数据源一致 + 机制清晰 + 可复现。
- 中：单一数据源 + 合理机制 + 部分验证。
- 低：样本小/口径不稳/仅相关。

## 交付格式

默认 Markdown，不超过 2 页；附录放明细表。文件名建议“主题-洞察-日期.md”。
`;

const INSIGHT_MEMO_TEMPLATE = `# {{主题}} 洞察备忘

> 分析人：{{姓名}} ｜ 日期：{{日期}} ｜ 数据范围：{{范围}} ｜ 口径：{{口径}}

## 结论

1. {{结论一 + 影响量级}}
2. {{结论二 + 影响量级}}
3. {{结论三 + 影响量级}}

## 证据

| 发现 | 关键数字 | 对比基准 | 来源/口径 |
| --- | --- | --- | --- |
| {{发现}} | {{数字}} | {{基准}} | {{来源}} |

## 解释与验证

- 已验证：{{机制/证据}}
- 待验证：{{假设 + 验证方法}}
- 反方解释：{{其他可能}}

## 建议

| 动作 | 对象 | 时间 | 预期影响 | 负责人 |
| --- | --- | --- | --- | --- |
| {{动作}} | {{对象}} | {{时间}} | {{影响}} | {{姓名}} |

## 局限

- {{数据缺口/口径风险/样本限制}}
`;

const CHART_SPEC = `{
  "rules": [
    { "goal": "趋势", "chart": "line", "x": "time", "y": "metric", "note": "不超过 5 条线，标注事件" },
    { "goal": "对比", "chart": "bar", "x": "category", "y": "value", "note": "按数值排序，从大到小" },
    { "goal": "构成", "chart": "stacked_bar", "x": "time", "y": "segment", "note": "段数不超过 6" },
    { "goal": "分布", "chart": "histogram", "x": "value", "note": "标注中位数与 P90" },
    { "goal": "漏斗", "chart": "funnel", "x": "stage", "y": "count", "note": "同时标注转化率与流失量" }
  ],
  "accessibility": {
    "color": "使用色盲友好配色，不只用颜色区分",
    "labels": "直接标注关键点，减少图例往返",
    "source": "图表下方标注数据范围与口径"
  }
}
`;

const PROFILE_DATASET_SCRIPT = String.raw`#!/usr/bin/env python3
"""CSV 数据体检：字段类型、缺失、唯一值、数值分布与 Top 值。"""
import argparse
import csv
import json
import os
import statistics
from collections import Counter


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--top', type=int, default=5)
    parser.add_argument('--max-rows', type=int, default=20000)
    return parser.parse_args()


def is_number(value):
    try:
        float(str(value).replace(',', ''))
        return True
    except (TypeError, ValueError):
        return False


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig', newline='') as handle:
        sample = handle.read(4096)
        handle.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample)
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(handle, dialect=dialect)
        rows = []
        for index, row in enumerate(reader):
            if index >= args.max_rows:
                break
            rows.append(row)
    if not rows:
        raise SystemExit('文件没有数据行')

    columns = list(rows[0].keys())
    result = {
        'input': args.input,
        'rows': len(rows),
        'columns': len(columns),
        'max_rows': args.max_rows,
        'fields': [],
    }
    for column in columns:
        values = [str(row.get(column, '')).strip() for row in rows]
        non_empty = [value for value in values if value != '']
        missing = len(values) - len(non_empty)
        unique = len(set(non_empty))
        field = {
            'name': column,
            'missing': missing,
            'missing_pct': round((missing / len(values)) * 100, 1) if values else 0,
            'unique': unique,
            'numeric': non_empty and all(is_number(value) for value in non_empty[:200]),
        }
        if field['numeric']:
            numbers = [float(value.replace(',', '')) for value in non_empty]
            numbers.sort()
            field.update({
                'min': round(numbers[0], 4),
                'max': round(numbers[-1], 4),
                'mean': round(statistics.fmean(numbers), 4),
                'median': round(statistics.median(numbers), 4),
                'p90': round(numbers[min(len(numbers) - 1, int(len(numbers) * 0.9))], 4),
            })
        else:
            field['top'] = Counter(non_empty).most_common(args.top)
        result['fields'].append(field)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
`;

/* ─────────────────────────── 3. 竞品研究 ─────────────────────────── */

const COMPETITOR_BODY = `# 竞品研究

## 何时使用

当用户需要做竞品对比、市场扫描、产品功能对标、定价/定位分析或“我们 vs 竞品”的决策材料时使用。典型触发：
- “对比一下我们和 A、B、C 三个竞品”
- “做一份 AI 工作台赛道的竞品分析”
- “评估某产品是否值得替代”

## 工作流

1. **先定决策**：这份研究支持什么决策（立项、定价、销售话术、产品路线）？没有决策就不要堆功能表。
2. **确定竞品集**：直接竞品 3-5 个 + 参照对象 1-2 个；说明选择与排除理由。
3. **建立维度与权重**：按 references/research-dimensions.md 选择 5-7 个维度，权重总和 100%。维度必须与决策相关。
4. **取证**：优先官网、定价页、文档、公开财报、真实试用；记录来源、日期、证据等级。禁止把营销话术当事实。
5. **评分**：把证据填入 assets/competitor-scorecard.csv，再调用 scripts/score_matrix.mjs 计算加权得分和排名。
   - 工具：run_skill_script；script：scripts/score_matrix.mjs；inputPath 指向评分 JSON/CSV。
6. **输出**：按 references/evidence-standards.md 写“结论 → 维度对比 → 差异解读 → 威胁/机会 → 建议”。
7. **自检**：每个评分有证据；每个结论有反方观点；注明信息截止日期。

## 输出规范

- 结论先行：谁领先、差距在哪、对我们意味着什么。
- 评分表必须展示原始分、权重、加权分，不只给排名。
- 区分“已验证事实”“供应商声明”“我们的推断”。
- 对关键差异给出证据链接/文档名与日期。
- 不贬低竞品，不编造功能或价格。

## 包内资源

- references/research-dimensions.md：竞品维度库与权重建议
- references/evidence-standards.md：来源分级与取证规范
- scripts/score_matrix.mjs：加权评分与排名
- assets/competitor-scorecard.csv：评分表模板
- assets/research-brief.md：研究简报模板
`;

const RESEARCH_DIMENSIONS = `# 竞品研究维度库

根据决策选择 5-7 个维度，不要全选。权重总和 100%。

| 维度 | 适用决策 | 建议权重 | 证据来源 |
| --- | --- | --- | --- |
| 目标客群与定位 | 市场进入/销售 | 15% | 官网、案例、销售材料 |
| 核心能力 | 产品路线 | 25% | 文档、试用、演示 |
| 体验与易用性 | 产品/增长 | 15% | 真实试用、用户评价 |
| 生态与集成 | 平台战略 | 15% | 应用市场、API 文档 |
| 定价与商业模式 | 定价/销售 | 15% | 定价页、合同样本 |
| 企业治理与安全 | 大客户 | 15% | 信任中心、合规认证 |
| 交付与服务 | 客户成功 | 10% | 服务条款、案例 |
| 性能与可靠性 | 技术选型 | 10% | 公开基准、POC |

## 评分锚点（1-5）

- 5：明显领先，有公开证据与规模化案例。
- 4：较强，能力完整，少量缺口。
- 3：可接受，满足基本场景。
- 2：较弱，需要大量补足。
- 1：缺失或不可用。
- 0：不适用（不要用 0 表示“差”）。

## 权重建议

- 不要给“功能数量”过高权重；能力深度 > 清单长度。
- 企业客户场景提高治理/安全/交付权重。
- 价格敏感市场提高定价权重。
- 权重变化要做敏感性分析：领先者是否因权重变化而改变？
`;

const EVIDENCE_STANDARDS = `# 取证与证据标准

## 来源分级

| 等级 | 来源 | 使用方式 |
| --- | --- | --- |
| A | 官方文档、定价页、财报、监管文件、真实试用 | 可作为事实 |
| B | 官方博客、公开演示、权威媒体、客户案例 | 需标注“官方声明” |
| C | 第三方评测、社区讨论、销售转述 | 仅作线索，需交叉验证 |
| D | 匿名爆料、无出处截图 | 不使用 |

## 记录格式

- 事实：来源 + 日期 + 原文位置。
- 推断：标注“推断”，写出依据与置信度。
- 冲突：并列呈现，不强行合并。

## 信息时效

- 价格、功能、融资、版本信息必须在 90 天内；超过要标注“可能过期”。
- 市场格局结论注明截止日期。
- 对快速变化的 AI 产品，优先最近 30 天信息。

## 反偏误

- 避免只找支持既有结论的证据。
- 至少找一个反方来源。
- 区分“有功能”与“功能好用/可规模化”。
- 不把 demo 当生产能力。
`;

const COMPETITOR_SCORECARD = `name,criterion_id,weight,score,evidence,source,date
我方,capability,25,3,核心对话与任务闭环,内部评估,2026-11-01
竞品A,capability,25,4,多模型与工具生态,官网文档,2026-11-01
竞品B,capability,25,2,功能有限,试用,2026-11-01
我方,experience,15,4,统一工作台,内部评估,2026-11-01
竞品A,experience,15,3,配置复杂,用户评价,2026-11-01
竞品B,experience,15,4,上手快,试用,2026-11-01
`;

const COMPETITOR_BRIEF = `# {{主题}} 竞品研究简报

> 决策问题：{{决策}} ｜ 信息截止：{{日期}} ｜ 负责人：{{姓名}}

## 结论

1. {{谁领先/差距/原因}}
2. {{对我们的威胁或机会}}
3. {{建议动作}}

## 竞品集

| 竞品 | 类型 | 选择理由 | 不选理由 |
| --- | --- | --- | --- |
| {{名称}} | 直接/参照 | {{理由}} | — |

## 加权评分

| 维度 | 权重 | 我方 | 竞品A | 竞品B | 关键证据 |
| --- | ---: | ---: | ---: | ---: | --- |
| {{维度}} | {{%}} | {{分}} | {{分}} | {{分}} | {{证据}} |
| **加权总分** | 100% | {{分}} | {{分}} | {{分}} | — |

## 关键差异

- {{差异一 + 证据 + 对我们意味着什么}}
- {{差异二 + 证据 + 对我们意味着什么}}

## 建议

| 动作 | 理由 | 时间 | 负责人 |
| --- | --- | --- | --- |
| {{动作}} | {{理由}} | {{时间}} | {{姓名}} |

## 反方观点与风险

- {{可能反驳 + 证据缺口}}
`;

const SCORE_MATRIX_SCRIPT = String.raw`#!/usr/bin/env node
/**
 * 加权评分：输入 JSON
 * {
 *   "criteria": [{"id":"capability","name":"核心能力","weight":25}],
 *   "competitors": [{"name":"我方","scores":{"capability":4}}]
 * }
 */
import fs from 'node:fs';

function parseArgs(argv) {
  const out = { format: 'markdown' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--input') out.input = argv[++i];
    else if (argv[i] === '--format') out.format = argv[++i];
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const input = args.input || process.env.SKILL_INPUT;
  if (!input) throw new Error('缺少 --input 或 SKILL_INPUT');
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const criteria = data.criteria || [];
  const competitors = data.competitors || [];
  if (!criteria.length || !competitors.length) throw new Error('criteria 和 competitors 不能为空');
  const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight || 0), 0);
  if (!totalWeight) throw new Error('权重总和不能为 0');

  const rows = competitors.map((competitor) => {
    let score = 0;
    const details = {};
    for (const criterion of criteria) {
      const raw = Number((competitor.scores || {})[criterion.id] ?? 0);
      if (raw < 0 || raw > 5) throw new Error('评分必须在 0-5：' + competitor.name + '/' + criterion.id);
      const weighted = (raw * Number(criterion.weight || 0)) / totalWeight;
      details[criterion.id] = weighted;
      score += weighted;
    }
    return { name: competitor.name, score: Number(score.toFixed(2)), details };
  });
  rows.sort((a, b) => b.score - a.score);

  if (args.format === 'json') {
    console.log(JSON.stringify({ totalWeight, rows }, null, 2));
    return;
  }
  const header = ['| 竞品 | ' + criteria.map((c) => c.name + '(' + c.weight + '%)').join(' | ') + ' | 加权总分 |'];
  const divider = ['| --- | ' + criteria.map(() => '---:').join(' | ') + ' | ---: |'];
  const body = rows.map((row) => '| ' + row.name + ' | ' + criteria.map((c) => Number(row.details[c.id]).toFixed(2)).join(' | ') + ' | **' + row.score.toFixed(2) + '** |');
  console.log([...header, ...divider, ...body].join('\n'));
  console.log('\n权重总和：' + totalWeight + '；评分 0-5，0 表示不适用。');
}

main();
`;

/* ─────────────────────────── 4. 会议纪要与行动项 ─────────────────────────── */

const MEETING_BODY = `# 会议纪要与行动项

## 何时使用

当用户提供会议录音转写、聊天记录、手写笔记，或要求整理会议纪要、决策、行动项、跟进邮件时使用。典型触发：
- “把这段会议记录整理成纪要和待办”
- “提取决策、负责人和截止时间”
- “写一封会后跟进邮件”

## 工作流

1. **识别会议类型**：决策会、周会、客户会、复盘会、评审会；不同类型输出重点不同。
2. **区分信息层级**：事实/讨论 → 决策 → 行动项 → 待定问题。不要把讨论中的想法写成已决定。
3. **提取行动项**：可先用 scripts/extract_actions.py 做启发式抽取（负责人、动作、日期），再人工/模型校正。
   - 工具：run_skill_script；script：scripts/extract_actions.py；inputText 传入转写文本
4. **补全行动项质量**：每项必须有“动词 + 对象 + 负责人 + 截止时间 + 验收标准”；缺失的标记【待确认】。
5. **输出纪要**：按 references/meeting-template.md 组织；决策与行动项放最前面。
6. **跟进邮件**：按 references/follow-up-email.md 生成简短邮件，突出决策、待办和需要确认的问题。

## 输出规范

- 开头给“会议结论摘要”3-5 条。
- 决策用“已决定：……”句式；未决定写“待定：……”。
- 行动项用表格，包含负责人/截止时间/状态/依赖。
- 保留关键分歧和未解决问题，不要假装达成一致。
- 引用原话时标注说话人；不确定的姓名写“待确认”。

## 质量门槛

- 行动项没有负责人或截止时间 → 标【待确认】而不是编造。
- 决策必须有明确拍板人；否则是“倾向”不是“决定”。
- 不泄露会议中明确要求保密的信息。
- 日期使用绝对日期，避免“下周三”歧义。

## 包内资源

- references/meeting-template.md：纪要结构与写法
- references/follow-up-email.md：会后跟进邮件模板
- references/action-quality.md：行动项质量规则
- scripts/extract_actions.py：启发式抽取行动项
- assets/meeting-notes-template.md：可填充纪要模板
- assets/action-tracker.csv：行动项跟踪表
`;

const MEETING_TEMPLATE = `# 会议纪要写作规范

## 推荐结构

1. 会议信息：主题、时间、参会人、主持人、记录人
2. 结论摘要：3-5 条，直接可读
3. 已决事项：决定 + 依据 + 拍板人
4. 行动项：表格
5. 待定问题：问题 + 需要谁决策 + 截止时间
6. 关键讨论：按议题，不按发言顺序
7. 附件/参考

## 写法

- 结论用动词开头：“批准 Q4 预算”“暂缓上线”。
- 决策写清“谁、在什么范围、什么时间前”。
- 行动项写“做什么、谁做、何时完成、如何验收”。
- 讨论只保留影响决策的信息；删掉寒暄和重复。
- 有分歧时并列呈现，不替当事人下结论。

## 行动项格式

| 动作 | 负责人 | 截止 | 验收标准 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 提交修订版方案 | 张三 | 2026-11-20 | 包含成本与风险两节 | 李四提供数据 | 待开始 |

## 敏感信息

- 客户名称、价格、个人信息按组织政策脱敏。
- 法务/人事事项标注“限定范围”。
`;

const FOLLOW_UP_EMAIL = `# 会后跟进邮件

主题：{{会议主题}} 纪要与行动项（{{日期}}）

各位好：

感谢参加今天的{{会议主题}}。以下是结论与待办，请在本周五前确认是否有遗漏。

## 已决定

1. {{决定一}}
2. {{决定二}}

## 行动项

| 事项 | 负责人 | 截止 |
| --- | --- | --- |
| {{事项}} | {{姓名}} | {{日期}} |

## 待确认

- {{需要确认的问题 + 谁确认 + 何时}}

如对以上内容有异议，请直接回复本邮件。谢谢。

{{记录人}}
`;

const ACTION_QUALITY = `# 行动项质量规则

## 合格行动项

- 动词开头：提交、确认、修复、发布、对齐、提供。
- 单一对象：一项行动只做一件事。
- 有负责人：具体到人，不写“团队”。
- 有截止时间：绝对日期。
- 有验收标准：可判断完成/未完成。
- 有依赖：需要谁提供什么。

## 常见问题

| 问题 | 反例 | 修正 |
| --- | --- | --- |
| 无负责人 | 尽快优化登录 | 张三在 11-20 前把登录成功率提升到 99.5% |
| 无截止 | 跟进客户 | 李四 11-18 前发送报价并记录 CRM |
| 多动作 | 完成测试和上线 | 拆成“完成回归测试”“提交上线申请” |
| 不可验收 | 提升体验 | 将首屏加载降到 2s 内 |
| 假决策 | 大家觉得可以 | 王五批准，11-22 前执行 |

## 状态

- 待开始 / 进行中 / 阻塞 / 已完成 / 已取消
- 阻塞必须写阻塞原因与解除人。
`;

const MEETING_NOTES_TEMPLATE = `# {{会议主题}} 会议纪要

> 时间：{{日期}} ｜ 主持人：{{姓名}} ｜ 记录人：{{姓名}} ｜ 参会：{{名单}}

## 结论摘要

1. {{结论}}
2. {{结论}}
3. {{结论}}

## 已决事项

| 决定 | 依据 | 拍板人 | 生效时间 |
| --- | --- | --- | --- |
| {{决定}} | {{依据}} | {{姓名}} | {{日期}} |

## 行动项

| 动作 | 负责人 | 截止 | 验收标准 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| {{动作}} | {{姓名}} | {{日期}} | {{标准}} | {{依赖}} | 待开始 |

## 待定问题

| 问题 | 需要谁决策 | 截止 | 备注 |
| --- | --- | --- | --- |
| {{问题}} | {{姓名}} | {{日期}} | {{备注}} |

## 关键讨论

### {{议题一}}

- 背景：
- 分歧：
- 结论/下一步：

## 附件

- {{文档/链接}}
`;

const ACTION_TRACKER = `id,action,owner,due,status,acceptance,dependency,source
A-001,提交修订版方案,张三,2026-11-20,待开始,包含成本与风险两节,李四提供数据,11-13 评审会
A-002,发送客户报价,李四,2026-11-18,进行中,客户确认收到,产品价格表,11-13 客户会
`;

const EXTRACT_ACTIONS_SCRIPT = String.raw`#!/usr/bin/env python3
"""从会议文本中启发式抽取行动项，输出 JSON 或 Markdown。"""
import argparse
import json
import os
import re
from datetime import datetime

ACTION_WORDS = ['负责', '跟进', '完成', '提交', '确认', '安排', '推进', '修复', '发布', '提供', '对齐', '整理', '输出', '验证', '联系', '准备', '更新', '评审', '发送']
DATE_PATTERN = re.compile(r'(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日|本周[一二三四五六日]|本周|下周[一二三四五六日]?|下月|周[一二三四五六日])')
OWNER_PATTERN = re.compile(r'([\u4e00-\u9fa5]{2,3})(?=负责|跟进|来|会)')
SPEAKER_PATTERN = re.compile(r'^\s*([\u4e00-\u9fa5]{2,4})[：:]\s*(.*)$')
MENTION_PATTERN = re.compile(r'@([\w\u4e00-\u9fa5]{2,12})')


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--format', choices=['json', 'markdown'], default='json')
    return parser.parse_args()


def split_sentences(text):
    text = text.replace('\r\n', '\n')
    chunks = re.split(r'[。！？!?\n]+', text)
    return [chunk.strip(' ，,;；') for chunk in chunks if chunk.strip()]


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig') as handle:
        content = handle.read()

    items = []
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        owner = ''
        speaker = SPEAKER_PATTERN.match(line)
        if speaker:
            owner = speaker.group(1)
            line = speaker.group(2).strip()
        mention = MENTION_PATTERN.search(line)
        if mention:
            owner = mention.group(1)
        elif not owner:
            owner_match = OWNER_PATTERN.search(line)
            if owner_match:
                owner = owner_match.group(1)
        for sentence in split_sentences(line):
            if not any(word in sentence for word in ACTION_WORDS):
                continue
            date_matches = DATE_PATTERN.findall(sentence)
            due = date_matches[-1] if date_matches else ''
            items.append({
                'action': sentence[:300],
                'owner': owner or '待确认',
                'due': due or '待确认',
                'status': '待开始',
                'acceptance': '待补充',
                'source': '会议转写',
            })

    if not items:
        items.append({
            'action': '未识别到明确行动项，请人工复核会议记录',
            'owner': '待确认', 'due': '待确认', 'status': '待确认',
            'acceptance': '待补充', 'source': '启发式抽取',
        })

    if args.format == 'markdown':
        lines = ['| 动作 | 负责人 | 截止 | 验收标准 |', '| --- | --- | --- | --- |']
        for item in items:
            lines.append('| ' + item['action'] + ' | ' + item['owner'] + ' | ' + item['due'] + ' | ' + item['acceptance'] + ' |')
        print('\n'.join(lines))
    else:
        print(json.dumps({'generatedAt': datetime.now().isoformat(), 'items': items}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
`;

/* ─────────────────────────── 5. 客服工单分级与回复 ─────────────────────────── */

const SUPPORT_BODY = `# 客服工单分级与回复

## 何时使用

当用户需要处理客户工单、投诉、故障上报、退款/账单问题，或要求生成客服回复、升级建议、SLA 判断时使用。典型触发：
- “帮我回复这个客户投诉”
- “这条工单应该定 P 几？”
- “客户说登录不了，怎么处理”

## 工作流

1. **先定级**：根据影响范围、业务损失、是否安全事件、是否有替代方案，按 references/support-policy.md 判定 P0-P3。安全/数据泄露一律升级。
2. **结构化抽取**：先用 scripts/triage_ticket.py 对文本做关键词和 SLA 初判，再结合客户等级与合同校正。
   - 工具：run_skill_script；script：scripts/triage_ticket.py；inputText 传入工单正文
3. **给回复**：按 assets/reply-templates.md 选择场景模板；先共情/确认事实，再给方案与时间点，不甩锅、不承诺未确认的赔偿。
4. **升级判断**：命中 P0/P1、安全、法务、媒体风险、关键客户时，写明升级对象与时限。
5. **跟进**：给出下一次更新时间与需要客户提供的信息。

## 回复规范

- 首段确认客户问题与影响，不用模板化“亲”。
- 事实不确定时用“我们正在核实”，不要编造原因。
- 给明确下一步、负责人角色、时间点；不能给精确时间时给更新频率。
- 不泄露其他客户信息，不评价内部同事。
- 涉及退款/赔偿时引用政策，超出权限写“需审批”。

## 质量门槛

- 优先级与 SLA 有依据（影响范围 + 客户等级 + 合同）。
- 回复包含：确认、解释、方案、时间、下一步。
- 不承诺无法兑现的修复时间。
- 安全事件不在普通工单中讨论细节。

## 包内资源

- references/support-policy.md：分级、SLA、升级矩阵
- references/reply-principles.md：客服沟通原则与禁用表达
- scripts/triage_ticket.py：工单分级与回复骨架
- assets/reply-templates.md：常见场景回复模板
- assets/ticket-sla.csv：SLA 与升级矩阵
`;

const SUPPORT_POLICY = `# 客服分级与 SLA 政策

## 优先级

| 级别 | 定义 | 示例 | 首次响应 | 升级 |
| --- | --- | --- | --- | --- |
| P0 | 核心服务不可用/数据泄露/安全事件，影响全部或大量客户 | 全站 500、数据被越权访问 | 5 分钟 | 立即升级技术负责人 + 安全 + 管理层 |
| P1 | 核心功能不可用或有重大业务损失，影响关键客户/多客户 | 登录失败、支付失败、报表全错 | 15 分钟 | 30 分钟内升级二线/客户成功负责人 |
| P2 | 部分功能异常或有替代方案，影响单客户/少量用户 | 导出失败、单个页面报错 | 1 小时 | 4 小时内升级二线 |
| P3 | 咨询、建议、外观/文案问题 | 如何使用、文案错别字 | 4 小时 | 1 个工作日内处理 |

## 判定顺序

1. 是否安全/合规事件 → P0。
2. 是否核心链路不可用 → P0/P1。
3. 影响客户数与合同等级。
4. 是否有替代方案/临时绕过。
5. 是否阻塞客户的关键业务时点。

## 升级矩阵

- P0：技术值班、安全负责人、客户成功负责人、管理层；每 30 分钟同步。
- P1：二线支持、模块负责人、客户成功经理；每 2 小时同步。
- P2：二线支持；每工作日更新。
- P3：一线支持；按队列处理。

## 禁止

- 不承诺未确认的修复时间。
- 不在普通工单中索要密码/完整身份证号。
- 不与客户争辩或归咎客户。
- 不擅自承诺退款/赔偿。
`;

const REPLY_PRINCIPLES = `# 客服回复原则

## 结构

1. 确认：复述问题与影响，让客户知道你理解了。
2. 事实：已知什么、未知什么、正在核实什么。
3. 方案：临时绕过 + 根本修复 + 预防。
4. 时间：下一次更新时间或预计完成时间。
5. 下一步：客户需要做什么、你会做什么。

## 语气

- 专业、具体、共情，不卑不亢。
- 用“我们”承担责任，用“您”尊重客户。
- 短句，避免内部术语和缩写。

## 禁用表达

- “这是正常的”
- “不是我们的问题”
- “我已经反馈了”（没有后续）
- “马上就好”（无依据）
- “系统就是这样”
- “你自己操作错了”

## 敏感场景

- 安全事件：只确认事实与保护措施，细节走安全通道。
- 退款：引用政策，说明审批链路。
- 媒体/法务：转交对应负责人，不擅自评论。
`;

const REPLY_TEMPLATES = `# 客服回复模板

## 故障/不可用

您好，我们已确认您遇到的{{问题}}，影响范围是{{范围}}。当前已启动{{应急动作}}，临时方案是{{绕过方案}}。我们会在{{时间}}前同步进展；如需紧急协助，请联系{{渠道}}。

## 数据/报表异常

您好，关于{{报表/数据}}的{{现象}}，我们正在核对口径与数据源。初步判断为{{原因/待确认}}，预计{{时间}}给出结论。为避免误导，建议先暂缓基于该数据的决策；我们会提供修订版。

## 账单/退款

您好，已收到您关于{{订单/账单}}的疑问。根据{{政策条款}}，当前可处理为{{方案}}；如涉及{{例外情形}}，需要{{审批角色}}确认，预计{{时间}}回复。请提供{{所需信息}}。

## 功能咨询

您好，{{功能}}可以这样使用：1）{{步骤一}}；2）{{步骤二}}。如果您希望实现{{目标}}，更推荐{{替代方案}}。需要我帮您配置吗？

## 投诉升级

您好，理解这件事对您的影响。我们已将问题升级给{{角色}}，由{{姓名/团队}}在{{时间}}前与您联系。当前已采取{{临时措施}}，后续进展会每{{频率}}同步。
`;

const TICKET_SLA = `priority,definition,first_response,update_frequency,escalation,owner
P0,核心服务不可用/安全事件/数据泄露,5 分钟,30 分钟,技术负责人+安全+管理层,值班经理
P1,核心功能不可用/关键客户重大损失,15 分钟,2 小时,二线+客户成功负责人,支持主管
P2,部分功能异常/有替代方案,1 小时,1 个工作日,二线支持,一线负责人
P3,咨询/建议/文案问题,4 小时,2 个工作日,无需升级,一线支持
`;

const TRIAGE_SCRIPT = String.raw`#!/usr/bin/env python3
"""工单分级：基于影响、安全、核心链路和客户等级给出 P0-P3 与 SLA 建议。"""
import argparse
import json
import os
import re


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--text', default='')
    parser.add_argument('--tier', default='standard', choices=['standard', 'key', 'strategic'])
    parser.add_argument('--channel', default='ticket')
    return parser.parse_args()


P0_WORDS = ['数据泄露', '越权', '被黑', '勒索', '全站', '所有用户', '全部客户', '核心服务不可用', '安全事件', 'payment outage']
P1_WORDS = ['无法登录', '登录失败', '支付失败', '无法支付', '订单丢失', '数据丢失', '生产环境', '全部报错', '无法使用', 'down']
P2_WORDS = ['导出失败', '报错', '加载失败', '显示错误', '部分用户', '单个页面', '同步失败', '慢']
CATEGORY_RULES = [
    ('安全', ['泄露', '越权', '攻击', '安全', '漏洞']),
    ('账单', ['退款', '发票', '账单', '扣费', '价格']),
    ('故障', ['无法', '失败', '报错', '不可用', '超时', '宕机']),
    ('咨询', ['怎么', '如何', '能否', '支持吗', '教程']),
]


def main():
    args = parse_args()
    text = args.text
    if not text and args.input:
        with open(args.input, 'r', encoding='utf-8-sig') as handle:
            text = handle.read()
    if not text:
        raise SystemExit('缺少工单文本：使用 --text、--input 或 SKILL_INPUT')

    lowered = text.lower()
    p0 = [word for word in P0_WORDS if word.lower() in lowered]
    p1 = [word for word in P1_WORDS if word.lower() in lowered]
    p2 = [word for word in P2_WORDS if word.lower() in lowered]
    category = '其他'
    for name, words in CATEGORY_RULES:
        if any(word.lower() in lowered for word in words):
            category = name
            break

    if p0:
        priority = 'P0'
    elif p1 or args.tier in ('key', 'strategic'):
        priority = 'P1'
    elif p2:
        priority = 'P2'
    else:
        priority = 'P3'

    sla = {
        'P0': {'first': '5 分钟', 'update': '30 分钟', 'escalate': '技术负责人/安全/管理层'},
        'P1': {'first': '15 分钟', 'update': '2 小时', 'escalate': '二线/客户成功负责人'},
        'P2': {'first': '1 小时', 'update': '1 个工作日', 'escalate': '二线支持'},
        'P3': {'first': '4 小时', 'update': '2 个工作日', 'escalate': '无'},
    }[priority]

    result = {
        'priority': priority,
        'category': category,
        'sla': sla,
        'signals': {'p0': p0, 'p1': p1, 'p2': p2},
        'customerTier': args.tier,
        'channel': args.channel,
        'nextSteps': [
            '确认影响范围与客户等级',
            '按 SLA 首次响应并给出下一次更新时间',
            'P0/P1 立即升级并建立事件记录',
            '安全事件转安全通道，不在普通工单讨论细节',
        ],
        'replyOutline': [
            '确认问题与影响',
            '说明已采取/正在采取的动作',
            '给出临时绕过或下一步',
            '明确下一次更新时间与联系人',
        ],
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
`;

/* ─────────────────────────── 6. 深度调研方法论（升级） ─────────────────────────── */

const RESEARCH_BODY = `# 深度调研方法论

## 何时使用

当用户需要做行业研究、公司研究、方案论证、市场进入、投资/合作尽调，或要求“有来源、可验证”的深度报告时使用。典型触发：
- “研究一下中国移动股票/某个行业”
- “帮我论证是否进入某个市场”
- “查清楚这个结论，给我来源”

## 工作流

1. **界定决策问题**：明确研究对象、时间范围、地域、读者、要支持的决策。
2. **搭建 MECE 框架**：3-5 个维度（市场、竞争、商业模式、财务、风险、监管），避免堆砌。
3. **制定检索计划**：组织知识库优先 → 官方/一手来源 → 权威二手 → 社区线索；记录关键词与检索日期。
4. **取证与分级**：按 references/evidence-standards.md 记录来源等级、日期、原文位置；关键事实至少两个独立来源。
5. **来源审计**：把来源清单整理为 JSON，调用 scripts/source_audit.py 检查一手比例、时效、域名集中度与缺口。
   - 工具：run_skill_script；script：scripts/source_audit.py；inputText/inputPath 传入 JSON
6. **交叉验证**：对关键数字做交叉核对；矛盾时并列呈现，说明置信度。
7. **输出报告**：按 assets/research-report-template.md 写“摘要 → 关键发现 → 证据 → 反方/风险 → 建议 → 来源”。
8. **自检**：对照 references/quality-checklist.md，确认没有无源数字、过时信息、单一来源结论。

## 输出规范

- 每个事实性论断标注 [n] 来源；来源表含标题、机构、日期、链接/文档。
- 区分事实、推断、假设；推断给置信度与验证方法。
- 至少给出一个反方观点或失败情景。
- 结论必须回答“所以呢/对决策意味着什么”。
- 不编造数据；找不到就写“未找到可靠公开数据”。

## 包内资源

- references/evidence-standards.md：来源分级与取证规范
- references/quality-checklist.md：研究质量检查清单
- references/report-structure.md：研究报告结构
- scripts/source_audit.py：来源清单审计
- assets/research-report-template.md：报告模板
- assets/citation-guide.md：引用格式
`;

const RESEARCH_QUALITY = `# 研究质量检查清单

## 问题与范围

- [ ] 决策问题、对象、时间范围、地域明确
- [ ] 读者与用途明确
- [ ] 关键概念有定义

## 证据

- [ ] 关键结论至少两个独立来源
- [ ] 一手来源比例合理（建议 ≥40%）
- [ ] 来源日期在有效期内；过时信息已标注
- [ ] 数字有口径、单位、时间
- [ ] 区分事实、推断、假设
- [ ] 至少一个反方观点/失败情景
- [ ] 没有无法核实的“据传/业内人士”

## 推理

- [ ] 结论由证据支撑，不是先有结论再找证据
- [ ] 区分相关与因果
- [ ] 关键假设显式写出
- [ ] 竞争/监管/执行风险覆盖

## 输出

- [ ] 摘要可直接给管理层阅读
- [ ] 每个事实有引用
- [ ] 建议具体到动作/对象/时间
- [ ] 来源表完整
- [ ] 已写入工作区
`;

const RESEARCH_STRUCTURE = `# 研究报告结构

## 一页纸摘要
- 研究问题与结论
- 3-5 条关键发现
- 对决策的建议
- 最大不确定性

## 正文
1. 背景与问题界定
2. 方法与来源
3. 市场/行业结构
4. 竞争格局
5. 商业模式与财务
6. 驱动因素与风险
7. 情景分析（乐观/基准/悲观）
8. 结论与建议

## 证据组织
- 每个小节先结论，再证据，再解释。
- 重要数字用表格，标注口径与来源。
- 反方观点单独成节，不藏在脚注。

## 附录
- 来源清单、访谈记录、计算过程、术语表。
`;

const RESEARCH_REPORT_TEMPLATE = `# {{主题}} 研究报告

> 委托人/读者：{{读者}} ｜ 日期：{{日期}} ｜ 范围：{{范围}} ｜ 信息截止：{{截止日期}}

## 摘要

**结论**：{{一句话结论}}

1. {{关键发现一 + 数字/证据}}
2. {{关键发现二 + 数字/证据}}
3. {{关键发现三 + 数字/证据}}

**建议**：{{行动建议}}

## 一、研究问题与方法

- 决策问题：
- 研究范围：
- 方法：知识库 / 公开资料 / 访谈 / 数据
- 主要局限：

## 二、关键发现

### 2.1 {{发现}}

- 事实：
- 证据：[1][2]
- 解释：
- 置信度：高/中/低

## 三、竞争与格局

| 对象 | 定位 | 优势 | 风险 | 来源 |
| --- | --- | --- | --- | --- |
| {{对象}} | {{定位}} | {{优势}} | {{风险}} | [n] |

## 四、驱动因素与风险

- 驱动：
- 风险：
- 反方观点：

## 五、情景分析

| 情景 | 触发条件 | 影响 | 概率 | 应对 |
| --- | --- | --- | --- | --- |
| 乐观 | {{条件}} | {{影响}} | {{%}} | {{动作}} |
| 基准 | {{条件}} | {{影响}} | {{%}} | {{动作}} |
| 悲观 | {{条件}} | {{影响}} | {{%}} | {{动作}} |

## 六、结论与建议

1. {{建议一：动作/对象/时间}}
2. {{建议二}}

## 来源

1. {{标题}}，{{机构}}，{{日期}}，{{链接/文档}}
`;

const CITATION_GUIDE = `# 引用格式

## 正文标注

- 事实：句末 [1]；多个来源 [1][2]。
- 推断：标注“推断”，并写依据来源。
- 直接引用：加引号并标注来源编号。

## 来源表

| # | 标题 | 机构/作者 | 日期 | 类型 | 链接/文档 |
| --- | --- | --- | --- | --- | --- |
| 1 | {{标题}} | {{机构}} | {{YYYY-MM-DD}} | 官方/财报/媒体/访谈 | {{URL}} |

## 规范

- 优先原始报告，不引用二手转述。
- 链接必须可访问；内部文档写文件名与版本。
- 日期是发布/数据截止日期，不是访问日期。
- 不使用“百度百科/维基”作为关键结论唯一来源。
`;

const SOURCE_AUDIT_SCRIPT = String.raw`#!/usr/bin/env python3
"""来源清单审计：数量、一手比例、时效、域名集中度与缺口。"""
import argparse
import json
import os
from datetime import datetime, timedelta
from urllib.parse import urlparse


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--max-age-days', type=int, default=365)
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig') as handle:
        data = json.load(handle)
    sources = data.get('sources', data if isinstance(data, list) else [])
    if not sources:
        raise SystemExit('来源列表为空')

    now = datetime.now()
    warnings = []
    domains = {}
    primary = 0
    fresh = 0
    for source in sources:
        if source.get('primary') or source.get('type') in ('official', 'filing', 'interview', 'primary'):
            primary += 1
        published = source.get('publishedAt') or source.get('date')
        if published:
            try:
                date = datetime.fromisoformat(str(published)[:10])
                if now - date <= timedelta(days=args.max_age_days):
                    fresh += 1
                else:
                    warnings.append('来源过旧：' + str(source.get('title', '')) + ' / ' + str(published))
            except ValueError:
                warnings.append('日期格式无法解析：' + str(source.get('title', '')))
        else:
            warnings.append('缺少日期：' + str(source.get('title', '')))
        url = source.get('url') or ''
        if url:
            domain = urlparse(url).netloc
            domains[domain] = domains.get(domain, 0) + 1

    total = len(sources)
    primary_ratio = primary / total
    freshness_ratio = fresh / total
    max_domain = max(domains.values()) if domains else 0
    if total < 5:
        warnings.append('来源数量偏少（<5）')
    if primary_ratio < 0.4:
        warnings.append('一手来源比例低于 40%')
    if freshness_ratio < 0.6:
        warnings.append('有效期内来源低于 60%')
    if max_domain and max_domain / total > 0.6:
        warnings.append('单一域名占比过高，注意来源多样性')

    result = {
        'totalSources': total,
        'primaryRatio': round(primary_ratio, 2),
        'freshnessRatio': round(freshness_ratio, 2),
        'domains': domains,
        'warnings': warnings,
        'verdict': 'pass' if not warnings else 'review',
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
`;

/* ─────────────────────────── 7. 结构化写作规范（升级） ─────────────────────────── */

const WRITING_BODY = `# 结构化写作规范

## 何时使用

当用户需要写方案、报告、邮件、通知、复盘、一页纸摘要，或要求把零散信息整理为正式文档时使用。典型触发：
- “把这份材料整理成给管理层的汇报”
- “写一份项目复盘/方案/公告”
- “检查这篇文章的结构和可读性”

## 工作流

1. **确认读者与目的**：谁读、读完要做什么、篇幅/语气/格式；缺失时默认“管理层、正式、精炼”。
2. **先写一页纸摘要**：背景一句话、结论三条、下一步三条。
3. **搭金字塔**：结论 → 论据 → 事实；每段一个观点，首句即主旨。
4. **写正文**：按 references/document-patterns.md 选择方案/复盘/通知/邮件结构。
5. **可读性检查**：把 Markdown 写入工作区，调用 scripts/readability_check.py，根据长段落、标题、列表、句子长度给建议。
   - 工具：run_skill_script；script：scripts/readability_check.py；inputPath 指向文档
6. **按清单自检**：references/style-guide.md + assets/review-checklist.md。
7. **交付**：写入工作区；文件名体现主题与版本。

## 输出规范

- 结论先行；标题能独立表达观点。
- 一段一个观点，段落不超过 5 行。
- 对比用表格，并列用列表；不堆砌形容词。
- 数字、时间、责任人、口径一致。
- 明确区分事实、判断、建议。

## 包内资源

- references/style-guide.md：写作风格与句式规范
- references/document-patterns.md：方案/复盘/通知/邮件结构
- scripts/readability_check.py：Markdown 可读性检查
- assets/one-pager-template.md：一页纸模板
- assets/review-checklist.md：交付前检查清单
`;

const STYLE_GUIDE = `# 写作风格指南

## 总原则

- 结论先行，观点句放段首。
- 用具体名词和动词，少用“赋能/抓手/闭环”等空词。
- 能删的字都删；能用一个例子说明就不用三个形容词。
- 对读者已知的信息不重复。

## 句子

- 中文句子建议 25-40 字；超过 60 字拆分。
- 一个句子只表达一个判断。
- 少用双重否定和被动语态。
- 术语首次出现给定义。

## 段落

- 一段一个中心思想。
- 段首句是结论，后续是证据/解释。
- 段落不超过 5 行（约 150 字）。
- 过渡句只连接逻辑，不重复内容。

## 标题

- 标题表达观点，不只写“背景/问题/方案”。
- 同级标题保持同一抽象层级。
- 不超过三级；更深层级用列表。

## 表格/列表

- 对比用表格，并列用列表，步骤用编号。
- 表格列不超过 6 列；数字右对齐。
- 列表项保持平行结构。

## 语气

- 正式但不僵硬；对事不对人。
- 坏消息先给结论，再给原因和补救。
- 建议用“建议 + 理由 + 动作”，不用命令式。
`;

const DOC_PATTERNS = `# 常见文档结构

## 方案

1. 一页纸摘要（背景/目标/方案/收益/风险）
2. 问题与目标
3. 方案与备选
4. 实施计划（里程碑/负责人/资源）
5. 风险与应对
6. 验收标准

## 复盘

1. 结论与关键教训
2. 目标 vs 结果
3. 做对了什么
4. 没做对什么（根因，不甩锅）
5. 可复用经验
6. 改进动作（负责人/时间）

## 通知

1. 一句话结论（什么变化、何时生效）
2. 影响范围
3. 需要读者做什么
4. 时间线与联系人
5. 常见问题

## 邮件

1. 主题：动作 + 对象 + 时间
2. 第一段：目的与结论
3. 背景（最多 3 句）
4. 请求/下一步（明确谁做什么）
5. 截止时间与联系方式

## 一页纸

- 背景 1 句
- 结论 3 条
- 证据 3 条
- 风险 2 条
- 下一步 3 条
`;

const ONE_PAGER = `# {{主题}} 一页纸

> 读者：{{读者}} ｜ 日期：{{日期}} ｜ 版本：{{版本}}

## 背景

{{一句话说明为什么现在需要这件事}}

## 结论

1. {{结论一}}
2. {{结论二}}
3. {{结论三}}

## 关键证据

| 证据 | 数字/事实 | 来源 |
| --- | --- | --- |
| {{证据}} | {{数字}} | {{来源}} |

## 风险与假设

- {{风险/假设 + 影响}}
- {{反方观点}}

## 下一步

| 动作 | 负责人 | 时间 |
| --- | --- | --- |
| {{动作}} | {{姓名}} | {{日期}} |
`;

const REVIEW_CHECKLIST = `# 文档交付检查清单

- [ ] 读者、目的、篇幅明确
- [ ] 标题表达观点，层级一致
- [ ] 开头有结论/摘要
- [ ] 一段一个观点，长段落已拆分
- [ ] 数字有时间、口径、单位
- [ ] 术语一致，首次出现有定义
- [ ] 表格/列表格式统一
- [ ] 事实、判断、建议区分清楚
- [ ] 风险/反方观点没有被隐藏
- [ ] 下一步有负责人和时间
- [ ] 已检查错别字、标点、链接
- [ ] 已写入工作区并命名
`;

const READABILITY_SCRIPT = String.raw`#!/usr/bin/env python3
"""Markdown 可读性检查：段落、句子、标题、列表与长句。"""
import argparse
import json
import os
import re


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', default=os.environ.get('SKILL_INPUT', ''))
    parser.add_argument('--max-paragraph', type=int, default=180)
    parser.add_argument('--max-sentence', type=int, default=60)
    return parser.parse_args()


def main():
    args = parse_args()
    if not args.input:
        raise SystemExit('缺少输入：使用 --input 或 SKILL_INPUT')
    with open(args.input, 'r', encoding='utf-8-sig') as handle:
        text = handle.read()

    lines = text.splitlines()
    paragraphs = []
    current = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current:
                paragraphs.append(' '.join(current))
                current = []
        elif stripped.startswith('#') or stripped.startswith('- ') or stripped.startswith('* ') or re.match(r'^\d+\.', stripped):
            if current:
                paragraphs.append(' '.join(current))
                current = []
            if stripped.startswith('#') or stripped.startswith('- ') or stripped.startswith('* ') or re.match(r'^\d+\.', stripped):
                paragraphs.append(stripped)
        else:
            current.append(stripped)
    if current:
        paragraphs.append(' '.join(current))

    body = [p for p in paragraphs if not p.startswith('#') and not p.startswith('- ') and not p.startswith('* ') and not re.match(r'^\d+\.', p)]
    sentences = [s for s in re.split(r'[。！？!?；;]', ' '.join(body)) if s.strip()]
    long_paragraphs = [p for p in body if len(p) > args.max_paragraph]
    long_sentences = [s for s in sentences if len(s) > args.max_sentence]
    headings = [line for line in lines if line.strip().startswith('#')]
    bullets = [line for line in lines if line.strip().startswith(('- ', '* '))]

    issues = []
    if long_paragraphs:
        issues.append('有 ' + str(len(long_paragraphs)) + ' 个段落超过 ' + str(args.max_paragraph) + ' 字')
    if long_sentences:
        issues.append('有 ' + str(len(long_sentences)) + ' 个句子超过 ' + str(args.max_sentence) + ' 字')
    if len(headings) < 3 and len(text) > 1200:
        issues.append('长文档标题层级偏少')
    if not bullets and len(text) > 800:
        issues.append('没有列表，信息密度可能过高')

    result = {
        'characters': len(text),
        'paragraphs': len(body),
        'headings': len(headings),
        'bullets': len(bullets),
        'avgParagraphChars': round(sum(len(p) for p in body) / len(body), 1) if body else 0,
        'avgSentenceChars': round(sum(len(s) for s in sentences) / len(sentences), 1) if sentences else 0,
        'longParagraphs': len(long_paragraphs),
        'longSentences': len(long_sentences),
        'issues': issues,
        'verdict': 'pass' if not issues else 'revise',
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
`;

/* ─────────────────────────── 8. RFP / 投标响应 ─────────────────────────── */

const RFP_BODY = `# RFP / 投标响应

## 何时使用

当用户需要响应 RFP、招标文件、供应商问卷、安全评估表，或需要把需求拆成合规矩阵和投标大纲时使用。典型触发：
- “帮我拆解这份 RFP 的要求”
- “做一个投标响应矩阵”
- “检查我们的方案是否覆盖所有强制项”

## 工作流

1. **读取招标文件**：提取截止时间、提交格式、评分办法、资格门槛、强制条款、联系人。
2. **拆需求**：把每条要求编号，标注 mandatory/optional、类别、证据需求、负责人。
3. **生成合规矩阵**：调用 scripts/requirements_matrix.mjs，输入 JSON 需求列表，输出 Markdown/CSV 矩阵。
   - 工具：run_skill_script；script：scripts/requirements_matrix.mjs；inputText/inputPath 传入 JSON
4. **制定 win themes**：3-5 个差异化主张，每个对应客户痛点、证据、价值量化。
5. **搭大纲**：按 references/proposal-playbook.md 和 assets/proposal-outline.md。
6. **逐条响应**：用“理解 → 方案 → 证据 → 交付物”四段式；强制项不得空。
7. **评审**：合规评审（逐条覆盖）+ 内容评审（清晰/可信）+ 定价评审；列出未决问题。

## 输出规范

- 合规矩阵每条有：ID、原文要求、强制/可选、响应位置、负责人、状态、证据。
- 不用“完全满足”除非有证据；用“满足/部分满足/需澄清/不满足”。
- 明确假设、例外、依赖客户提供的信息。
- 截止时间、页数、格式等硬性要求单独列检查表。
- 不承诺未确认的产品能力或交付日期。

## 包内资源

- references/proposal-playbook.md：投标策略与评审门
- references/compliance-guide.md：合规矩阵填写规范
- scripts/requirements_matrix.mjs：需求矩阵生成
- assets/compliance-matrix.csv：矩阵模板
- assets/proposal-outline.md：投标文件大纲
`;

const PROPOSAL_PLAYBOOK = `# 投标策略手册

## 评审门

1. **资格门**：营业执照、资质、案例、财务、法务；不满足直接放弃或找联合体。
2. **合规门**：强制条款逐条覆盖；任何“不满足”需书面澄清。
3. **技术门**：架构、集成、安全、迁移、运维、SLA。
4. **商务门**：报价、付款、履约、违约、知识产权。
5. **交付门**：团队、排期、验收、培训、售后。

## Win Themes

- 每个主题回答：客户最痛什么 → 我们凭什么 → 证据是什么 → 量化价值。
- 3-5 个即可；不要写成公司介绍。
- 证据优先：案例、基准、POC、第三方认证。

## 响应写法

- 理解：复述客户要求与场景。
- 方案：具体怎么做，含架构/流程/角色。
- 证据：案例、数据、认证、团队。
- 交付物：客户会收到什么，何时。

## 常见失分

- 复制模板，不回应具体需求。
- 强制项漏答或答非所问。
- 过度承诺，交付不可行。
- 报价与方案范围不一致。
- 忽视招标文件的格式/页数/签章要求。
`;

const COMPLIANCE_GUIDE = `# 合规矩阵填写规范

## 字段

| 字段 | 说明 |
| --- | --- |
| ID | 与招标文件条款编号一致；无编号则 R-001 |
| Requirement | 原文要求，不改写 |
| Mandatory | mandatory / optional / clarification |
| Category | 技术/商务/法务/安全/交付 |
| Response | 满足 / 部分满足 / 需澄清 / 不满足 |
| Section | 响应文件章节 |
| Owner | 负责人 |
| Evidence | 案例/文档/认证/承诺 |
| Status | 未开始/进行中/已评审/已确认 |

## 规则

- 强制项不得空白；不满足必须写澄清或偏离说明。
- “部分满足”要写清边界与替代方案。
- 证据必须可附；不要只写“公司实力强”。
- 每条需求只有一个负责人。
- 评审后锁定版本，变更走变更记录。
`;

const COMPLIANCE_MATRIX = `id,requirement,mandatory,category,response,section,owner,evidence,status
R-001,支持私有化部署并兼容现有 Kubernetes 集群,mandatory,技术,满足,3.2 部署架构,张三,案例A/架构图,已确认
R-002,提供 SSO 与细粒度权限,mandatory,安全,部分满足,4.1 安全,李四,路线图 Q1,进行中
R-003,提供 99.9% SLA,mandatory,交付,需澄清,5.2 SLA,王五,待法务确认,未开始
R-004,支持自定义报表,optional,技术,满足,3.5 报表,张三,演示环境,已确认
`;

const PROPOSAL_OUTLINE = `# {{项目}} 投标文件大纲

> 客户：{{客户}} ｜ 截止：{{日期}} ｜ 版本：{{版本}}

## 0. 封面与目录

- 项目名称、投标人、日期、版本、保密声明
- 逐条对应招标文件章节

## 1. 执行摘要

- 对客户痛点的理解（3 句）
- 我们的差异化主张（3 条）
- 为什么是我们（证据）

## 2. 需求理解与范围

- 业务目标、成功标准
- 范围边界、假设、依赖

## 3. 解决方案

- 总体架构
- 关键流程
- 集成与迁移
- 安全与合规
- 运维与 SLA

## 4. 交付计划

- 里程碑、团队、客户配合
- 验收标准与移交

## 5. 案例与证据

- 同类案例、量化结果、客户证言

## 6. 商务

- 报价、付款、变更、知识产权

## 7. 合规矩阵

- 见 assets/compliance-matrix.csv

## 8. 风险与澄清

- 风险、假设、待澄清问题
`;

const REQUIREMENTS_MATRIX_SCRIPT = String.raw`#!/usr/bin/env node
/**
 * 需求矩阵：输入 JSON
 * {"requirements":[{"id":"R-001","text":"...","mandatory":true,"category":"技术"}]}
 * 输出 Markdown 或 CSV，含响应/负责人/证据空列。
 */
import fs from 'node:fs';

function parseArgs(argv) {
  const out = { format: 'markdown' };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--input') out.input = argv[++i];
    else if (argv[i] === '--format') out.format = argv[++i];
  }
  return out;
}

function csvCell(value) {
  const text = String(value == null ? '' : value);
  return '"' + text.replace(/"/g, '""') + '"';
}

function main() {
  const args = parseArgs(process.argv);
  const input = args.input || process.env.SKILL_INPUT;
  if (!input) throw new Error('缺少 --input 或 SKILL_INPUT');
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const list = data.requirements || data;
  if (!Array.isArray(list) || !list.length) throw new Error('requirements 不能为空');
  const ids = new Set();
  const rows = list.map((item, index) => {
    const id = String(item.id || 'R-' + String(index + 1).padStart(3, '0'));
    if (ids.has(id)) throw new Error('需求 ID 重复：' + id);
    ids.add(id);
    return {
      id,
      requirement: String(item.text || item.requirement || '').trim(),
      mandatory: item.mandatory === false ? 'optional' : 'mandatory',
      category: item.category || '未分类',
      response: '待填写',
      section: '',
      owner: '',
      evidence: '',
      status: '未开始',
    };
  });
  if (rows.some((row) => !row.requirement)) throw new Error('存在空需求');

  if (args.format === 'csv') {
    const headers = ['id', 'requirement', 'mandatory', 'category', 'response', 'section', 'owner', 'evidence', 'status'];
    const lines = [headers.join(',')];
    for (const row of rows) lines.push(headers.map((key) => csvCell(row[key])).join(','));
    console.log(lines.join('\n'));
    return;
  }
  const lines = ['| ID | 需求 | 类型 | 类别 | 响应 | 章节 | 负责人 | 证据 | 状态 |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  for (const row of rows) {
    lines.push('| ' + row.id + ' | ' + row.requirement + ' | ' + row.mandatory + ' | ' + row.category + ' | ' + row.response + ' | ' + row.section + ' | ' + row.owner + ' | ' + row.evidence + ' | ' + row.status + ' |');
  }
  const mandatory = rows.filter((row) => row.mandatory === 'mandatory').length;
  lines.push('');
  lines.push('共 ' + rows.length + ' 条需求，其中强制项 ' + mandatory + ' 条。');
  console.log(lines.join('\n'));
}

main();
`;

export const SKILL_LIBRARY: SkillDefinition[] = [
  {
    name: '周报生成器',
    description:
      '根据工作记录和指标数据生成周报/月报/管理层汇报，自动计算环比、目标达成与异常，输出可直接交付的 Markdown。',
    category: '效率',
    icon: 'calendar',
    version: '1.0.0',
    license: 'internal',
    allowedTools: ['workspace_read', 'workspace_write', 'run_skill_script'],
    body: WEEKLY_REPORT_BODY,
    bindTo: ['通用助手', '数据分析师'],
    files: [
      text('references/report-template.md', WEEKLY_TEMPLATE),
      text('references/quality-checklist.md', WEEKLY_CHECKLIST),
      text('references/metrics-glossary.md', WEEKLY_METRICS_GLOSSARY),
      text('scripts/aggregate_metrics.mjs', AGGREGATE_METRICS_SCRIPT),
      text('assets/weekly-report-template.md', WEEKLY_TEMPLATE),
      text('assets/weekly-report.css', WEEKLY_CSS),
      text('assets/metrics-sample.csv', WEEKLY_SAMPLE),
    ],
  },
  {
    name: '数据分析与洞察',
    description:
      '对 CSV/Excel 导出数据做体检、漏斗/贡献度/同期群分析与异常归因，产出带证据和行动建议的洞察备忘录。',
    category: '分析',
    icon: 'chart',
    version: '1.0.0',
    license: 'internal',
    allowedTools: ['workspace_read', 'workspace_write', 'knowledge_search', 'run_skill_script'],
    body: DATA_INSIGHT_BODY,
    bindTo: ['数据分析师', '通用助手', 'Atlas 首席策略官'],
    files: [
      text('references/analysis-playbook.md', ANALYSIS_PLAYBOOK),
      text('references/metrics-glossary.md', WEEKLY_METRICS_GLOSSARY),
      text('references/insight-standards.md', INSIGHT_STANDARDS),
      text('scripts/profile_dataset.py', PROFILE_DATASET_SCRIPT),
      text('assets/insight-memo-template.md', INSIGHT_MEMO_TEMPLATE),
      text('assets/chart-spec.json', CHART_SPEC),
    ],
  },
  {
    name: '竞品研究',
    description:
      '针对明确决策问题做竞品选择、维度加权、证据分级与评分，输出竞品对比报告和威胁/机会建议。',
    category: '研究',
    icon: 'target',
    version: '1.0.0',
    license: 'internal',
    allowedTools: ['knowledge_search', 'web_search', 'read_url', 'workspace_write', 'run_skill_script'],
    body: COMPETITOR_BODY,
    bindTo: ['深度研究员', 'Atlas 首席策略官'],
    files: [
      text('references/research-dimensions.md', RESEARCH_DIMENSIONS),
      text('references/evidence-standards.md', EVIDENCE_STANDARDS),
      text('scripts/score_matrix.mjs', SCORE_MATRIX_SCRIPT),
      text('assets/competitor-scorecard.csv', COMPETITOR_SCORECARD),
      text('assets/research-brief.md', COMPETITOR_BRIEF),
    ],
  },
  {
    name: '会议纪要与行动项',
    description:
      '把会议转写/笔记整理为决策、行动项、待定问题与跟进邮件，行动项包含负责人、截止时间与验收标准。',
    category: '效率',
    icon: 'users',
    version: '1.0.0',
    license: 'internal',
    allowedTools: ['workspace_write', 'run_skill_script'],
    body: MEETING_BODY,
    bindTo: ['通用助手', '文档工程师'],
    files: [
      text('references/meeting-template.md', MEETING_TEMPLATE),
      text('references/follow-up-email.md', FOLLOW_UP_EMAIL),
      text('references/action-quality.md', ACTION_QUALITY),
      text('scripts/extract_actions.py', EXTRACT_ACTIONS_SCRIPT),
      text('assets/meeting-notes-template.md', MEETING_NOTES_TEMPLATE),
      text('assets/action-tracker.csv', ACTION_TRACKER),
    ],
  },
  {
    name: '客服工单分级与回复',
    description:
      '对客户工单/投诉做 P0-P3 分级、SLA 与升级判断，并生成专业、可执行的客服回复与后续动作。',
    category: '服务',
    icon: 'headphones',
    version: '1.0.0',
    license: 'internal',
    allowedTools: ['knowledge_search', 'workspace_write', 'run_skill_script'],
    body: SUPPORT_BODY,
    bindTo: ['通用助手'],
    files: [
      text('references/support-policy.md', SUPPORT_POLICY),
      text('references/reply-principles.md', REPLY_PRINCIPLES),
      text('scripts/triage_ticket.py', TRIAGE_SCRIPT),
      text('assets/reply-templates.md', REPLY_TEMPLATES),
      text('assets/ticket-sla.csv', TICKET_SLA),
    ],
  },
  {
    name: '深度调研方法论',
    description:
      '面向决策问题的深度研究：MECE 框架、多源取证、来源审计、交叉验证与带引用的结构化报告。',
    category: '研究',
    icon: 'telescope',
    version: '1.0.0',
    license: 'internal',
    allowedTools: ['knowledge_search', 'web_search', 'read_url', 'workspace_write', 'run_skill_script'],
    body: RESEARCH_BODY,
    bindTo: ['深度研究员', 'Atlas 首席策略官'],
    files: [
      text('references/evidence-standards.md', EVIDENCE_STANDARDS),
      text('references/quality-checklist.md', RESEARCH_QUALITY),
      text('references/report-structure.md', RESEARCH_STRUCTURE),
      text('scripts/source_audit.py', SOURCE_AUDIT_SCRIPT),
      text('assets/research-report-template.md', RESEARCH_REPORT_TEMPLATE),
      text('assets/citation-guide.md', CITATION_GUIDE),
    ],
  },
  {
    name: '结构化写作规范',
    description:
      '把零散信息写成管理层可读的方案/复盘/通知/邮件，提供一页纸结构、风格检查与可读性脚本。',
    category: '写作',
    icon: 'pen',
    version: '1.0.0',
    license: 'internal',
    allowedTools: ['workspace_read', 'workspace_write', 'run_skill_script'],
    body: WRITING_BODY,
    bindTo: ['文档工程师', '通用助手'],
    files: [
      text('references/style-guide.md', STYLE_GUIDE),
      text('references/document-patterns.md', DOC_PATTERNS),
      text('scripts/readability_check.py', READABILITY_SCRIPT),
      text('assets/one-pager-template.md', ONE_PAGER),
      text('assets/review-checklist.md', REVIEW_CHECKLIST),
    ],
  },
  {
    name: 'RFP 投标响应',
    description:
      '拆解 RFP/招标文件，生成合规矩阵、win themes 与投标大纲，逐条覆盖强制项并组织评审。',
    category: '商务',
    icon: 'briefcase',
    version: '1.0.0',
    license: 'internal',
    allowedTools: ['workspace_read', 'workspace_write', 'run_skill_script'],
    body: RFP_BODY,
    bindTo: ['文档工程师'],
    files: [
      text('references/proposal-playbook.md', PROPOSAL_PLAYBOOK),
      text('references/compliance-guide.md', COMPLIANCE_GUIDE),
      text('scripts/requirements_matrix.mjs', REQUIREMENTS_MATRIX_SCRIPT),
      text('assets/compliance-matrix.csv', COMPLIANCE_MATRIX),
      text('assets/proposal-outline.md', PROPOSAL_OUTLINE),
    ],
  },
  STOCK_SKILL,
];
