# Cuter · 集团级 AI 工作台

> 用自然语言下达目标，Cuter 自主规划、调用企业能力、在审批与审计之下执行，并交付可验收的成果。
> 对标 WorkBuddy / DeepSeek Harness / Dify，但以**对话与任务为中心**，把专家、技能、连接器、知识库沉淀为组织资产。

- 一套系统覆盖：对话 · 任务 · 应用中心 · 专家 · 技能 · 连接器（MCP）· 知识库 · 治理
- 单镜像可部署，默认零依赖（PGlite）；生产切 PostgreSQL + 独立 Worker
- 多模型网关：OpenAI 兼容（DeepSeek / Qwen / Moonshot / OpenRouter / vLLM）、Anthropic 原生、Ollama 原生（含上下文与思考控制）
- 企业治理：多租户、RBAC、逐动作审批、全量审计、配额与成本、API Key、健康与指标

详细设计见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)，运维手册见 [`docs/OPERATIONS.md`](docs/OPERATIONS.md)，公开 API 见 [`docs/API.md`](docs/API.md)。

---

## 快速开始（3 分钟）

要求：Node.js ≥ 22（推荐 22 LTS / 23），npm ≥ 10。

```bash
npm install
cp .env.example .env
npm run setup     # 建表 + 写入演示组织、专家、技能包、应用、知识库与 MCP 连接器
npm run dev       # http://localhost:3100
```

> 端口使用 **3100**，避免与常见本地服务（如 Grafana 的 3000）冲突。
> `npm run setup` 请在应用未运行时执行：内置 PGlite 是单进程数据库。
> 从旧版本升级时，执行 `npm run db:migrate && npm run db:backfill && npm run db:seed-skills` 补齐技能包、内置技能库与默认应用。`db:seed-skills -- --force` 会覆盖同名技能包文件，请谨慎使用。

演示账号：

```
邮箱：admin@cuter.ai
密码：Cuter2026
```

未配置任何模型接口时，平台使用内置**演示模型**，可完整体验流式输出、推理展示、知识检索、任务规划、交付物与审批链路。添加真实供应商后自动切换。

### 配置真实模型

进入「设置 → 模型供应商 → 添加供应商」：

| 供应商 | Base URL | 模型示例 |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-4-5` |
| 通义千问（兼容模式） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 本地 Ollama | `http://127.0.0.1:11434`（协议选 Ollama 原生） | `qwen3.6:35b-a3b-q8_0` |

保存后点击「测试」拉取在线模型列表，可一键导入。API Key 以 AES-256-GCM 加密存储，前端只回显掩码。

---

## 产品能力

### 对话工作台
流式输出、推理过程折叠、工具调用卡片、引用溯源、交付物侧栏、附件（图片 / PDF / DOCX / 文本）、停止生成、审批后恢复、成本用量展示。同一会话保留多轮上下文，并提供 Dark / Light 主题。

- **问答**：只读工具，不写文件、不执行技能脚本，适合事实问答与检索。
- **规划**：只输出执行计划，不调用工具；确认后手动切换到执行。
- **执行**：可写工作区、调用任务/MCP/技能脚本，敏感动作逐次审批，适合交付材料。
- 通用新对话默认「问答」；从专家或应用进入时使用专家的默认模式。
- 对话框底部可直接选择**专家**和**技能**：默认「自动」跟随专家绑定；手动选择最多 3 个技能会覆盖默认，按会话持久化。任务创建弹窗同样支持专家与技能选择。

### 任务中心
把复杂目标转后台任务：自动生成 3-7 步计划、逐步推进、实时进度、事件时间线、交付物、等待审批、取消 / 重试、标准 5 段 cron 定时执行。可把任一轮对话一键转任务。

### 专家
人格 + 模型 + 技能 + 知识库 + 连接器 + 工具策略的组合，支持可见性、版本、调用统计与多专家委派（最多两级）。

### 技能（标准技能包）
- **标准结构**：`SKILL.md`（YAML frontmatter + 方法正文）、`references/`、`scripts/`、`assets/`，支持在线文件树编辑与资源上传。
- **内置 9 个完整技能包**（每个都含 references/scripts/assets）：周报生成器、数据分析与洞察、竞品研究、会议纪要与行动项、客服工单分级与回复、深度调研方法论、结构化写作规范、RFP 投标响应、股票深度分析与预测。
- **渐进式加载**：按用户问题匹配 1-2 个技能加载完整 SKILL.md，其余只注入目录；参考文件通过 `skill_read_file` 按需读取，避免上下文膨胀。
- **脚本执行**：`run_skill_script` 在隔离目录运行，支持 `inputPath` / `inputText`，自动复制脚本参数中引用的工作区文件；30 秒超时、强制人工审批，`SKILL_ALLOW_SCRIPTS=false` 可关闭。
- **发布与版本**：发布时校验包结构并生成不可变快照，专家按版本绑定；HTTP 工具声明保留在 manifest 中。
- **模板**：空白 / 研究分析 / 结构化写作 / 数据分析四类起始模板；`npm run db:seed-skills` 可幂等补齐内置库。

### 应用中心
统一纳管内部专家应用与外部 AI 工具：内部应用绑定专家，点击直接进入带应用标识的对话；外部应用登记 http(s) 地址后一键新开。支持分类、搜索、最近使用、启停与审计，是工作台的超级入口。

### 连接器（MCP）
官方 MCP 协议：stdio / Streamable HTTP / SSE。管理员登记 → 测试连接 → 拉取工具清单 → 绑定专家。凭据加密、工具级审计、`MCP_ALLOW_STDIO=false` 可关闭本地进程。

### 知识库
上传 PDF / DOCX / TXT / MD / CSV / JSON / HTML，自动解析、分块、嵌入。混合检索（向量余弦 + 词法覆盖），中文无需分词器；回答自动标注来源。支持召回测试与远程 Embedding。

### 企业治理
组织隔离、成员与邀请、四类角色、月度 token 配额、成本看板、审计日志、组织级 API Key、Prometheus 指标、健康检查。

---

## 架构一览

```
Next.js 15 (App Router / RSC / SSE)
 ├─ 领域模块：Threads / Experts / Skill Packages / Connectors / Knowledge / Tasks / Apps
 ├─ Agent Runtime：可替换 Loop · 工具注册 · 审批挂起/恢复 · 文件沙箱 · 子专家委派
 ├─ LLM Gateway：OpenAI 兼容 + Anthropic + Ollama 原生 + 演示模型
 ├─ RAG：解析 → 分块 → 嵌入 → 混合检索
 ├─ MCP Manager：三种传输 · 工具缓存 · 加密凭据
 └─ Kernel：RBAC · 审计 · 用量 · 加密 · SSRF 防护
PostgreSQL / PGlite（同一套 Drizzle schema 与迁移）
```

**为什么是模块化单体？** 一边界清晰、事务一致、部署简单；当任务并发或嵌入吞吐成为瓶颈时，可按 `docs/ARCHITECTURE.md` 的演进路径拆出 Worker / Gateway。

---

## 目录结构

```
src/
  app/                    # 页面与 API（App Router）
    (app)/chat|apps|tasks|experts|skills|connectors|knowledge|settings
    api/                  # 内部 API + 公开 v1
  components/             # 设计系统与业务组件
  server/
    agent/                # Runtime、工具、审批、上下文
    llm/                  # 多模型网关、流式解析、嵌入
    rag/                  # 解析、分块、检索
    mcp/                  # MCP 客户端管理
    tasks/                # Runner、调度器、cron、事件
    db/                   # Schema、连接、迁移
    auth/ security/ usage/
drizzle/                  # SQL 迁移
deploy/                   # 生产 Compose 与 K8s
docs/                     # 架构、运维、API
scripts/                  # 迁移、种子、示例 MCP、协议测试
tests/                    # 单元测试
```

---

## 部署

### 单机 / 私有化
```bash
APP_SECRET=$(openssl rand -hex 32) docker compose up -d --build
# http://localhost:3100
```
数据持久化在 `cuter_data` 卷，内置 PGlite，无需外部数据库。容器内不预置演示账号：首次访问点击「创建组织」即可，平台会自动生成默认专家与技能。若需要演示账号、示例知识库与工单连接器，先在本地运行 `npm run setup`（或进入容器执行等价脚本）再构建数据卷。

### 生产集群（PostgreSQL + Web + Worker）
```bash
APP_SECRET=$(openssl rand -hex 32) docker compose -f deploy/docker-compose.prod.yml up -d --build
```
包含一次性迁移 Job、Web 与独立 Worker，可水平扩展。K8s 参考清单见 `deploy/k8s.yaml`。

### 构建产物
```bash
npm run build
node .next/standalone/server.js   # 需先复制 .next/static 与 drizzle
```

---

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `APP_SECRET` | 自动生成 | 会话与密钥加密根密钥；**生产必须显式配置** |
| `DATABASE_URL` | 空 | 留空使用 PGlite；生产填 PostgreSQL |
| `DATA_DIR` | `./.data` | PGlite、附件与交付物目录 |
| `APP_URL` | `http://localhost:3100` | 邀请链接与绝对地址 |
| `DEMO_MODE` | `true` | 无供应商时启用演示模型 |
| `MCP_ALLOW_STDIO` | `true` | 是否允许 stdio 连接器（托管环境建议 false） |
| `INPROCESS_WORKER` | `true` | 进程内任务执行器；多副本部署时关闭 |
| `TASK_CONCURRENCY` | `2` | 单进程任务并发 |
| `MIGRATE_ON_BOOT` | `true` | 启动时自动迁移 |
| `TAVILY_API_KEY` | 空 | 启用联网搜索工具 |
| `TOOL_ALLOWED_HOSTS` | 空 | 工具出口域名白名单（允许内网时显式列出） |

---

## 演示路径（建议依次体验）

1. **对话**：新建对话 → 输入「帮我写一份 Q4 增长复盘报告」→ 查看流式输出与工具卡片 → 打开右侧交付物预览。
2. **审批**：切换到「文档工程师」专家 → 再发一次文档需求 → 审批卡出现 → 批准后继续执行。
3. **知识库**：切换到「深度研究员」→ 问「差旅住宿标准和报销时效是什么？」→ 查看引用来源；在知识库详情页试召回。
4. **任务**：任务中心 → 新建任务并开启定时 → 查看计划、进度、事件与交付物。
5. **连接器**：连接器 → 测试「示例工单系统」→ 对「数据分析师」说「查一下未关闭工单」→ 审批后查看 MCP 实时结果。
6. **治理**：设置 → 用量 / 审计 / 成员 / API Key。

---

## 公开 API

创建 API Key（设置 → API 密钥）后：

```bash
# 列出专家
curl http://localhost:3100/api/v1/experts \
  -H "Authorization: Bearer cw_xxx"

# 知识检索
curl -X POST http://localhost:3100/api/v1/knowledge/<kbId>/search \
  -H "Authorization: Bearer cw_xxx" -H 'content-type: application/json' \
  -d '{"query":"差旅标准","topK":5}'

# 运行专家（非流式，返回最终结果与交付物）
curl -X POST http://localhost:3100/api/v1/experts/<expertId>/run \
  -H "Authorization: Bearer cw_xxx" -H 'content-type: application/json' \
  -d '{"input":"写一份客户支持周报","mode":"agent"}'
```

完整说明见 [`docs/API.md`](docs/API.md)。

---

## 质量与安全

```bash
npm run typecheck   # TypeScript 严格模式
npm run test        # Vitest：cron / 分块 / 计算器 / 参数校验 / SSRF / 沙箱 / RBAC / 加密
npm run build       # 生产构建
```

- 密码 scrypt 加盐；会话令牌仅存哈希；Cookie HttpOnly + SameSite=Lax + Origin 校验
- 所有业务表强制 `org_id` 隔离；RBAC 四级角色
- 工具出口 SSRF 防护（私网/回环/元数据地址拦截，重定向逐跳校验）
- 文件沙箱：路径穿越与绝对路径拦截、realpath 复核
- 提示注入：外部内容包裹为 `untrusted_data`，工具策略独立于模型输出
- 审计：登录、资产变更、密钥、审批、危险工具调用全量落库

---

## 已知边界（v1）

- PGlite 仅支持单进程；多副本请使用 PostgreSQL。
- 交付物存储适配本地卷；对象存储适配器在路线图中。
- 未内置 OIDC/SAML 与行级权限；私有化可先在网关层接入 SSO。
- 向量检索为应用层混合检索，超大数据集建议迁移 pgvector（接口已隔离）。
- 代码执行沙箱、DOCX/PPTX 原生导出在后续版本提供。

---

## License

MIT（见 `LICENSE`）。
