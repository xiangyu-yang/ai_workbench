---
name: rfp-response
description: 拆解 RFP/招标文件，生成合规矩阵、win themes 与投标大纲，逐条覆盖强制项并组织评审。
version: 1.0.0
license: internal
allowed-tools:
  - workspace_read
  - workspace_write
  - run_skill_script
metadata:
  display-name: RFP 投标响应
  category: 商务
  icon: briefcase
  bind-to: 文档工程师
---

# RFP / 投标响应

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
