---
name: 数据分析与洞察
description: 对 CSV/Excel 导出数据做体检、漏斗/贡献度/同期群分析与异常归因，产出带证据和行动建议的洞察备忘录。
version: 1.0.0
license: internal
allowed-tools:
  - workspace_read
  - workspace_write
  - knowledge_search
  - run_skill_script
metadata:
  category: 分析
  icon: chart
  bind-to: 数据分析师,通用助手,Atlas 首席策略官
---

# 数据分析与洞察

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
