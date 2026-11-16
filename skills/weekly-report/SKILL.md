---
name: weekly-report
description: 根据工作记录和指标数据生成周报/月报/管理层汇报，自动计算环比、目标达成与异常，输出可直接交付的 Markdown。
version: 1.0.0
license: internal
allowed-tools:
  - workspace_read
  - workspace_write
  - run_skill_script
metadata:
  display-name: 周报生成器
  category: 效率
  icon: calendar
  bind-to: 通用助手,数据分析师
---

# 周报生成器

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
