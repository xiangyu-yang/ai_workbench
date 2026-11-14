# Cuter 运维手册

## 1. 部署形态

| 形态 | 数据库 | 任务执行 | 适用 |
| --- | --- | --- | --- |
| 单机 | PGlite（`DATA_DIR/pg`） | 进程内 | POC、50 人内团队、边缘 |
| 生产 | PostgreSQL 16+ | Web + 独立 Worker | 集团/多团队 |
| K8s | 外部 PG + 共享卷/对象存储 | 独立 Worker Deployment | 高可用 |

单机启动：`docker compose up -d --build`（端口 3100）。
生产启动：`APP_SECRET=... docker compose -f deploy/docker-compose.prod.yml up -d --build`。

## 2. 首次部署检查表

1. `APP_SECRET` 使用 ≥32 字节随机值（`openssl rand -hex 32`），并纳入密钥管理。
2. 设置 `APP_URL` 为真实外部地址（邀请链接依赖它）。
3. 设置 `NODE_ENV=production`，前置 TLS/WAF。
4. 决定 `MCP_ALLOW_STDIO`：托管集群建议 `false`，仅允许 HTTP/SSE 连接器。
5. 配置 `TAVILY_API_KEY`（如需联网搜索）与 `TOOL_ALLOWED_HOSTS`（如需访问内网系统）。
6. 运行迁移 Job，再启动 Web/Worker；确认 `/api/health` 返回 `status: ok`。
7. 首次登录后立即修改演示账号密码（或重新创建组织）。
8. 配置日志采集与 Prometheus 抓取 `/api/metrics`（建议加 `METRICS_TOKEN`）。

## 3. 数据库与迁移

```bash
# 生成迁移（修改 schema 后）
npm run db:generate

# 执行迁移（应用停止时）
npm run db:migrate

# 演示数据
npm run db:seed
```

- 迁移文件位于 `drizzle/`，随镜像发布；生产建议关闭 `MIGRATE_ON_BOOT`，由发布流水线执行迁移 Job。
- **PGlite 是单进程数据库**：禁止在 Web 进程运行时执行 `db:migrate` / `db:seed` / 其他脚本，否则可能损坏数据目录。若出现 `RuntimeError: Aborted()`，检查是否有第二个进程打开了同一 `DATA_DIR/pg`。
- 迁移前备份（见 §5）。

## 4. 扩容与调度

- Web 无状态，可水平扩展；SSE 要求入口关闭响应缓冲（Nginx `proxy_buffering off`，超时 ≥ 600s）。
- 生产将 `INPROCESS_WORKER=false`，由 Worker 消费任务；任务通过数据库状态机（`queued → planning → running → …`）与条件更新抢占，避免重复执行。
- 调度器每 30s 检查到期定时任务；多 Worker 同时运行是安全的（条件更新）。
- 对话生成由进程内 Run Manager 托管；单实例内 SSE 断开不会取消。多副本部署时 `stop` 只能命中同一实例，需通过网关粘性会话或后续增加数据库取消标记。
- 任务执行器每分钟回收 `running/planning` 且超过 10 分钟无锁心跳的任务，写 `task.recovered` 事件后重新排队；服务重启造成的中断不会再永久卡在运行中。
- Ollama 连续 180 秒无输出会中断并返回明确错误（`OLLAMA_IDLE_TIMEOUT_MS` 可调），避免界面无限等待。
- 单机 PGlite 模式下调度器随 Web 进程启动（首次页面/API 访问触发）。若长时间无流量，定时任务会延迟到下一次请求；需要严格按时执行请使用 PostgreSQL + 独立 Worker。
- 单进程任务并发由 `TASK_CONCURRENCY` 控制；LLM 限流在供应商侧，必要时在网关层加队列。
- 重启恢复：启动后回收本实例遗留的 `running` 任务；运行期间每分钟扫描超过 10 分钟无锁心跳的 `running/planning` 任务，写 `task.recovered` 事件后重新排队。

## 5. 备份与恢复

### PostgreSQL
```bash
pg_dump -Fc "$DATABASE_URL" > cuter-$(date +%F).dump
pg_restore -d "$DATABASE_URL" --clean --if-exists cuter-2026-01-01.dump
```
备份内容包含消息、审计、用量、任务、专家配置与加密后的供应商密钥。**`APP_SECRET` 必须与备份一起安全管理**，否则密钥无法解密。

### PGlite
停止容器后快照 `DATA_DIR`（`pg/`、`uploads/`、`workspaces/`）：

```bash
docker run --rm -v cuter_data:/data -v "$PWD":/backup alpine \
  tar czf /backup/cuter-data-$(date +%F).tgz -C /data .
```

恢复时解压回卷并确保属主为 UID 1001。

### 交付物
`DATA_DIR/workspaces/` 为交付物，`DATA_DIR/uploads/` 为知识库原始文件与对话附件。多副本部署需共享存储（NFS/CephFS）或替换为 S3 适配器。

消息 `parts` 现在会保留完整工具结果（单次最多约 100k 字符）和报告文本，数据库与备份体积会相应增长；建议按组织保留策略归档旧会话，并监控 `messages`、`runs`、`artifacts` 的增长速度。

## 6. 密钥与轮换

| 密钥 | 影响 | 轮换方式 |
| --- | --- | --- |
| `APP_SECRET` | 会话失效；供应商 API Key 无法解密 | 停服 → 备份 → 更新环境变量 → 重新录入供应商密钥 → 启动 |
| 模型 API Key | 对应供应商不可用 | 设置页更新（覆盖式），旧值立即失效 |
| 组织 API Key | 外部集成失效 | 设置页撤销并重新创建 |

会话 Cookie 为 HttpOnly + SameSite=Lax；生产启用 HTTPS 后 `secure` 自动开启。

## 7. 可观测性

- `GET /api/health`：数据库连通、版本、数据层类型、运行时长。供 K8s 探针。
- `GET /api/metrics`：Prometheus 文本（任务状态、24h 运行数/Token、运行中任务、版本）。设置 `METRICS_TOKEN` 后需 `Authorization: Bearer`。
- 运行记录：`runs` 表（模型、token、成本、延迟、错误）；任务事件 `task_events` 可回放。
- 日志：结构化 JSON（请求 ID、组织、异常）。建议 Loki/ELK 采集。
- 告警建议：5xx 比例 > 1%、任务失败率 > 3%、配额使用 > 80%、P95 首 token > 3s、数据库连接耗尽。

## 本地 Ollama 排障

- 平台会自动识别 `11434` 端口并切换到 Ollama 原生 `/api/chat`，也可在「设置 → 模型供应商」显式选择「Ollama 本地（原生）」。
- 默认 `OLLAMA_NUM_CTX=32768`。Qwen3 / DeepSeek-R1 等思考模型在上下文或输出预算不足时可能只产出思考、没有正文；平台会强制一次无工具收口并给出明确提示。
- 默认 `OLLAMA_THINK=false`，优先保证最终回答稳定；需要展示思考过程时设为 `true`。
- `OLLAMA_KEEP_ALIVE=30m` 减少 30B 级模型反复加载。修改后重启 Web 进程。
- `OLLAMA_IDLE_TIMEOUT_MS=180000`：连续 180 秒无输出会中断并返回明确错误，避免界面无限等待。
- 用 `ollama ps` 确认 CONTEXT 是否为 32768；显存不足时降低 `OLLAMA_NUM_CTX`，或换更小的量化模型。长对话由滑动窗口摘要与 `history_search` / `evidence_search` / `evidence_read` 维持局部记忆，不应通过无限提高上下文解决。
- 若仍返回空内容，请记录模型名、模式（问答/执行/任务）与 Ollama 日志，平台会保留明确的 finish_reason 诊断。

## 股票行情与专家

- `Atlas 首席策略官` 由 `npm run db:seed-stock-expert` 幂等安装；新组织注册时自动创建，并绑定股票、深度研究、数据分析三个技能。
- 股票技能使用 `fetch_market_data.py` / `live_market_scan.py` 拉取腾讯公开行情；A 股基本面来自东方财富结构化接口；需要 Web/Worker 具备访问 `qt.gtimg.cn`、`web.ifzq.gtimg.cn`、`push2his.eastmoney.com`、`datacenter.eastmoney.com` 的出站网络。
- 多标的推荐先走 `screen_stocks.py`（人工维护的龙头观察池，不是全市场量化筛选）；大盘/指数/跨市场走 `market_overview.py`；单股再走 `live_market_scan.py`。
- 股票研究禁止通过 `read_url` / `http_request` 抓取财经网页；联网搜索仅在配置 `TAVILY_API_KEY` 时开放，并用于新闻/公告/催化剂，不允许用搜索结果补财务数字。港股/美股没有结构化财务数据时标注“未获取”，不编造财务数字。
- 行情接口可能限流或变更；脚本失败时应让用户上传 CSV，禁止模型编造当日数据。
- 输出必须包含数据截止日、来源、5/20 日量比口径、量价组合、情景与风险提示；不构成投资建议。
- 工具完整结果保留在消息 `parts` 中，模型侧只接收摘要；需要复盘时用 `evidence_search/evidence_read`，不要要求用户重发或重新抓取网页。

## 8. 故障排查

| 现象 | 排查 | 处理 |
| --- | --- | --- |
| 端口占用 `EADDRINUSE` | `lsof -i:3100` | 改端口或停止占用进程；本仓库默认 3100 以避开 Grafana |
| PGlite `Aborted()` | 是否有第二个进程打开 `DATA_DIR/pg`；数据目录是否被并发写 | 停掉所有实例；从备份恢复或重建数据目录 |
| 流式输出被一次性返回 | 反向代理缓冲 | Nginx `proxy_buffering off`、`X-Accel-Buffering: no`（已内置）、读超时 ≥ 600s |
| 模型 401/429 | 供应商密钥/配额 | 设置页测试连接；网关对 429/5xx 已重试一次 |
| 工具调用总在等审批 | 专家工具策略为 `dangerous`/`always` | 在专家编辑器中调整；审批记录在设置 → 审计 |
| 任务卡在 running | Worker 崩溃/被杀 | 等待约 10 分钟无心跳自动回收，或手动 `UPDATE tasks SET status='queued', locked_by=NULL WHERE id=...` |
| 切换会话后仍出现审批框 | 消息 parts 残留旧的 `pending_approval` | 刷新会话触发审批对账；服务端会将已结束/已处理审批收敛为失效 |
| 聊天区停在报告标题但无后续 | 摘要被截断，完整正文已写入交付物 | 打开交付物卡片查看完整报告；服务端会自动生成 Markdown 交付物 |
| 长对话忘记早先结论 | 滑动窗口只保留最近原文 | 让模型用 `history_search` 检索旧结论；精确工具数字用 `evidence_search/evidence_read` |
| MCP 连接失败 | stdio 被禁用、命令不存在、URL 不可达 | 查看连接器卡片错误；本地验证 `node scripts/demo-mcp.mjs` |
| 知识库检索无结果 | 文档处理失败、嵌入维度不一致 | 文档列表查看状态；召回测试；必要时重传 |
| `quota_exceeded` (402) | 月度 token 配额 | 设置 → 组织调整配额 |

## 技能库升级

```bash
npm run db:seed-skills                 # 仅补齐缺失的内置技能
npm run db:seed-stock-expert           # 补齐 Atlas 股票专家与应用（幂等）
npm run db:seed-skills -- --force      # 覆盖同名技能包并生成新版本（会替换包文件）
```

内置库定义在 `src/server/skills/library.ts`；新组织在注册时自动安装。升级前先停止应用（PGlite 单进程），并备份 `DATA_DIR`。

## 技能脚本安全

- `SKILL_ALLOW_SCRIPTS=true` 才会向专家暴露 `run_skill_script`；该工具即使专家策略为 never 也强制人工审批。
- 脚本在 `DATA_DIR/skill-runs/{org}/{skill}/{version}` 的隔离目录运行，仅支持 Node/Python/Bash，30 秒超时、1MB 输出上限，环境变量最小化。
- 生产建议保持 `false`，或把 Web/Worker 放入具备内核隔离、网络策略与只读根文件系统的容器后再开启。脚本可访问网络与文件系统，不等同于强沙箱。

## 9. 安全基线

- 强制 TLS；入口限制管理端访问来源；WAF 可选。
- `APP_SECRET` 由 KMS/Secrets Manager 注入，禁止写入镜像/仓库。
- 关闭不必要的 stdio 连接器；对 HTTP 连接器使用最小权限凭据与出口白名单。
- 审计日志保留 ≥ 180 天（按合规要求调整），定期导出。
- 依赖漏洞扫描（`npm audit` / Trivy）纳入 CI；升级前跑 `typecheck + test + build`。
- 定期轮换模型与连接器密钥；离职成员立即移除并撤销其 API Key。
- 数据导出/删除请求通过组织管理员执行；消息与审计不可被普通成员删除。

## 10. 升级流程

1. 备份数据库与 `DATA_DIR`。
2. 拉取新镜像 → 执行迁移 Job → 滚动更新 Web → 更新 Worker。
3. 验证 `/api/health`、登录、一次对话、一次任务、连接器测试。
4. 回滚：回退镜像；若迁移不可逆，使用备份恢复（迁移采用增量、可审阅 SQL）。
