---
name: 客服工单分级与回复
description: 对客户工单/投诉做 P0-P3 分级、SLA 与升级判断，并生成专业、可执行的客服回复与后续动作。
version: 1.0.0
license: internal
allowed-tools:
  - knowledge_search
  - workspace_write
  - run_skill_script
metadata:
  category: 服务
  icon: headphones
  bind-to: 通用助手
---

# 客服工单分级与回复

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
