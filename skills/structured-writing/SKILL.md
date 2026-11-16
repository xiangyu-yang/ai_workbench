---
name: structured-writing
description: 把零散信息写成管理层可读的方案/复盘/通知/邮件，提供一页纸结构、风格检查与可读性脚本。
version: 1.0.0
license: internal
allowed-tools:
  - workspace_read
  - workspace_write
  - run_skill_script
metadata:
  display-name: 结构化写作规范
  category: 写作
  icon: pen
  bind-to: 文档工程师,通用助手
---

# 结构化写作规范

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
