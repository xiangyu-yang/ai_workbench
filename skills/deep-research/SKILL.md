---
name: deep-research
description: 面向决策问题的深度研究：MECE 框架、多源取证、来源审计、交叉验证与带引用的结构化报告。
version: 1.0.0
license: internal
allowed-tools:
  - knowledge_search
  - web_search
  - read_url
  - workspace_write
  - run_skill_script
metadata:
  display-name: 深度调研方法论
  category: 研究
  icon: telescope
  bind-to: 深度研究员,Atlas 首席策略官
---

# 深度调研方法论

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
