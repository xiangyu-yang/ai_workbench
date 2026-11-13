# Cuter 公开 API（v1）

所有接口使用组织级 API Key：

```
Authorization: Bearer cw_<prefix>_<secret>
```

- 权限：`read`（查询/检索）或 `read + write`（运行专家、创建任务）
- 限流：120 请求/分钟/Key（单实例内存限流；集群建议网关层限流）
- 错误格式：`{ "error": "说明", "code": "machine_code" }`
- 生产地址示例：`https://cuter.example.com`

---

## 1. 列出专家

```http
GET /api/v1/experts
```

```json
{
  "experts": [
    { "id": "exp_...", "name": "深度研究员", "description": "...", "category": "研究", "defaultMode": "agent" }
  ]
}
```

## 2. 运行专家（非流式）

```http
POST /api/v1/experts/{expertId}/run
Content-Type: application/json

{
  "input": "写一份客户支持周报，包含高频问题与改进动作",
  "mode": "agent"
}
```

`mode`：`ask` | `plan` | `agent`（默认 `agent`）。请求会创建一个独立会话并同步等待执行完成（最长约 5 分钟）。

响应：

```json
{
  "ok": true,
  "status": "completed",
  "threadId": "thr_...",
  "messageId": "msg_...",
  "content": "……最终 Markdown 回答……",
  "usage": { "inputTokens": 3200, "outputTokens": 900 },
  "artifacts": [
    { "type": "artifact", "name": "客户支持周报.md", "artifactId": "art_...", "mime": "text/markdown", "size": 5120 }
  ],
  "approvals": [],
  "error": null
}
```

- `status=awaiting_approval` 表示专家调用了需审批的工具。API 调用方需在 Web 界面完成审批，或改用工具策略为 `never` 的专家。
- 交付物下载：`GET /api/artifacts/{artifactId}?download=1`（需登录会话，暂不支持 API Key）。

## 3. 知识检索

```http
POST /api/v1/knowledge/{knowledgeBaseId}/search
Content-Type: application/json

{ "query": "差旅住宿标准", "topK": 5 }
```

```json
{
  "results": [
    {
      "title": "差旅与费用报销制度.md",
      "snippet": "- 一线城市：住宿标准 600 元/晚……",
      "score": 0.4821,
      "documentId": "doc_...",
      "ordinal": 0
    }
  ]
}
```

## 4. 创建任务

```http
POST /api/v1/tasks
Content-Type: application/json

{
  "title": "每周竞品简报",
  "goal": "检索竞品公开动态，输出结构化简报，保存为 Markdown 交付物。",
  "expertId": "exp_..."
}
```

响应 `201`：

```json
{ "ok": true, "id": "tsk_...", "status": "queued" }
```

任务由 Worker 异步执行；结果可在任务中心查看，或通过内部接口查询：

```http
GET /api/tasks/{taskId}
```

（任务查询接口目前使用浏览器会话鉴权；如需 API Key 访问，可在 `/api/v1/tasks/{id}` 上按同一模式扩展。）

---

## 5. 内部 API（浏览器会话）

以下接口由 Web 前端使用，使用 HttpOnly 会话 Cookie 鉴权，变更请求需同源 Origin：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册（可带邀请码） |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/chat` | SSE 流式对话；body 支持 `expertId`、`mode`、`skillIds`（null=自动 / []=不使用 / 列表=手动） |
| POST | `/api/chat/stop` | 按 `messageId` 中断生成 |
| GET | `/api/threads/{id}/messages` | 消息/审批/交付物快照，用于离开页面后追平流式输出 |
| POST | `/api/chat/resume` | 审批后恢复 |
| PATCH | `/api/approvals/{id}` | 批准 / 拒绝 |
| GET/PATCH/DELETE | `/api/threads[/{id}]` | 会话 |
| GET/POST | `/api/experts` | 专家 |
| GET/PATCH/DELETE | `/api/experts/{id}` | 专家详情 |
| GET/POST | `/api/skills` | 技能（标准技能包） |
| GET/PATCH/DELETE | `/api/skills/{id}` | 技能详情 / 元数据 |
| PUT/DELETE | `/api/skills/{id}/files` | 读写 / 删除包内文件（JSON） |
| GET | `/api/skills/{id}/files?path=` | 读取文件或下载资源 |
| POST | `/api/skills/{id}/upload` | 上传 assets 资源（multipart） |
| POST | `/api/skills/{id}/publish` | 校验并发布不可变版本 |
| POST | `/api/skills/{id}/test` | 工具试跑 |
| GET/POST | `/api/connectors` | MCP 连接器 |
| POST | `/api/connectors/{id}/test` | 拉取工具清单 |
| GET/POST | `/api/knowledge` | 知识库 |
| POST | `/api/knowledge/{id}/documents` | 上传并入库（multipart） |
| POST | `/api/knowledge/{id}/search` | 召回测试 |
| GET/POST | `/api/tasks` | 任务；创建时支持 `expertId` 与 `skillIds` |
| GET/POST | `/api/apps` | 应用中心 |
| POST | `/api/apps/{id}/open` | 记录最近使用并返回入口 |
| GET/PATCH/DELETE | `/api/apps/{id}` | 应用详情 / 更新 / 删除 |
| POST | `/api/tasks/{id}/cancel` / `retry` | 取消 / 重试 |
| GET/POST | `/api/providers` | 模型供应商 |
| POST | `/api/providers/{id}/test` | 测试连通与模型列表 |
| GET/PATCH | `/api/members[/{id}]` | 成员 |
| GET/POST | `/api/invites` | 邀请 |
| GET/POST/DELETE | `/api/api-keys[/{id}]` | 组织 API Key |
| GET | `/api/usage` | 用量与成本 |
| GET | `/api/audit` | 审计日志（管理员） |
| GET | `/api/health` | 健康检查（公开） |
| GET | `/api/metrics` | Prometheus 指标（可加 Token） |

### SSE 事件协议

`POST /api/chat` 返回 `text/event-stream`：

| event | data |
| --- | --- |
| `meta` | `{runId, messageId, threadId}` |
| `text` | `{delta}` |
| `reasoning` | `{delta}` |
| `skill` | `{part:{id,name,version,selection,fileCount,...}}` 本轮加载的技能 |
| `tool_start` | `{id, name}` |
| `tool_result` | `{id, name, status, summary, output?, durationMs?, approvalId?}` |
| `approval` | `{approval:{id, toolName, toolArgs, risk, messageId, taskId?}}` |
| `artifact` | `{artifact:{id, name, mime, size, kind}}` |
| `citation` | `{citation:{index, title, snippet, source?, score?}}` |
| `usage` | `{inputTokens, outputTokens, costUsd}` |
| `parts` | 最终消息分片快照（用于替换本地临时状态） |
| `status` | `{status}` |
| `error` | `{message}` |
| `done` | `{messageId, status, content}` |

流式实现建议：

1. 先渲染本地占位消息；
2. 按 `delta` 追加文本/推理；
3. 收到 `parts` 后用服务端快照覆盖；
4. `done` 后按 `messageId` 拉取最终数据。
