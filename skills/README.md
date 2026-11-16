# 内置技能源文件

这里是内置技能包的**源码目录**，遵循 Agent Skills 标准结构：

```text
<skill-slug>/
  SKILL.md        # YAML frontmatter + 方法正文，触发与工作流入口
  references/     # 研究框架、检查清单、领域知识
  scripts/        # 可独立执行的确定性脚本
  assets/         # 模板、样例数据、清单
```

## 与运行时数据库的关系

- `skills/` 是**作者与代码评审的源文件**；
- `npm run db:seed-skills` / 新组织 provisioning 会把目录加载为 `SkillDefinition`，写入 `skills`、`skill_files`、`skill_versions`；
- 线上运行使用数据库中的发布快照，不直接读取磁盘，保证版本可复现、可审计；
- 在界面修改技能会更新数据库快照，不会自动回写本目录；
- 需要把界面版本回流到源码时，走评审后的导出/PR，而不是让运行时双写。

## 新增或修改

1. 在 `skills/` 新建目录，至少包含 `SKILL.md`、`references/`、`scripts/`、`assets/`；
2. frontmatter 的 `name` 使用标准 ASCII slug（如 `stock-analysis`），中文界面名写在 `metadata.display-name`；`description` 必填，可选 `allowed-tools`；
3. `metadata` 中声明 `category`、`icon`、`bind-to`、`requires-execution`；
4. 运行 `npm run skills:check` 校验；
5. 在开发环境执行 `npm run db:seed-skills -- --force --only <技能名>` 更新数据库快照。

## 部署

Next standalone 构建与外层 Docker 镜像都会复制本目录。若自定义运行目录，请设置：

```text
SKILLS_DIR=/absolute/path/to/skills
```
