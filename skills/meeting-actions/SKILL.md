---
name: meeting-actions
description: 把会议转写/笔记整理为决策、行动项、待定问题与跟进邮件，行动项包含负责人、截止时间与验收标准。
version: 1.0.0
license: internal
allowed-tools:
  - workspace_write
  - run_skill_script
metadata:
  display-name: 会议纪要与行动项
  category: 效率
  icon: users
  bind-to: 通用助手,文档工程师
---

# 会议纪要与行动项

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
