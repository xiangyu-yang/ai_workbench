---
name: 竞品研究
description: 针对明确决策问题做竞品选择、维度加权、证据分级与评分，输出竞品对比报告和威胁/机会建议。
version: 1.0.0
license: internal
allowed-tools:
  - knowledge_search
  - web_search
  - read_url
  - workspace_write
  - run_skill_script
metadata:
  category: 研究
  icon: target
  bind-to: 深度研究员,Atlas 首席策略官
---

# 竞品研究

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
