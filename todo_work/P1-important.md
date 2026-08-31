# P1 · 生产就绪任务（Important）

**目标**：让 Agent 能上生产——接生态、能运维、可持久、有身份。

## P1-1 接入 MCP（Model Context Protocol）✅ 已完成

> 状态：已完成（详见 `.comate/specs/mcp-integration/summary.md`）。
> 实际实现：stdio transport、tools 桥接与注册、断连摘除 + 指数退避重连、`MCP_SERVERS` 配置校验、单测。
> 命名前缀最终采用 `${server}__${tool}`（双下划线，兼容 OpenAI function 名规则），非原计划的 `.`。
> 剩余缺口（超时、结果截断、schema 清洗、HTTP transport、准入控制、观测性等）见
> `.comate/specs/mcp-hardening/doc.md`。

- **目的**：让 Agent 能直接消费 MCP 生态的工具服务器（filesystem、git、db、浏览器等），避免每个工具重复造轮子。
- **影响文件**：
  - 新增 `src/agent/mcp/client.ts`：MCP stdio / SSE 客户端封装
  - 新增 `src/agent/mcp/bridge.ts`：把 MCP 的 `tools/list` 映射为本项目 `Tool` 接口并注册进 registry
  - `src/config/index.ts`：新增 `MCP_SERVERS`（JSON 数组：`[{name, command, args, env}]`）
  - `src/index.ts`：启动时并发连接配置的 MCP 服务器，注册它们暴露的工具
- **要点**：
  - 采用官方 `@modelcontextprotocol/sdk`（TS）
  - 工具命名冲突时以 `${server}.${tool}` 前缀避免碰撞
  - MCP 断连需自动重连 + 从 registry 摘除
- **验收**：
  - 配置一个 filesystem MCP server；`POST /agent/run` 能列出目录
  - 单测：mock MCP transport，bridge 正确注册 tool

## P1-2 真实 search 工具

- **目的**：`src/agent/tools/search.ts` 目前是 mock。
- **影响文件**：
  - `src/agent/tools/search.ts`：接入 Tavily / Serper / Bing Web Search（选其一，优先 Tavily 免费额度）
  - `src/config/index.ts`：`SEARCH_PROVIDER` + `SEARCH_API_KEY`
- **要点**：
  - 结果统一结构 `{title, url, snippet}[]`，`top_k` 参数默认 5
  - 网络失败走 P0-3 的重试
  - 允许通过配置切换到 MCP 版本（若接入了 web-search MCP server 则跳过内置实现）
- **验收**：
  - e2e：`POST /agent/run { input: "今天有什么 AI 新闻" }` 返回真实结果链接

## P1-3 可观测性（request-id / tracing / metrics）

- **目的**：目前只有 Fastify 默认 log，无法追踪一次请求跨 controller → agent → tool → LLM 的全链路。
- **影响文件**：
  - 新增 `src/observability/tracing.ts`：初始化 OpenTelemetry NodeSDK，导出到 OTLP
  - 新增 `src/observability/metrics.ts`：Prometheus registry；暴露 `GET /metrics`
  - `src/index.ts`：注册 request-id hook（`fastify-request-id` 或手写 `onRequest`）
  - 在 planner / executor / provider 中打 span
- **要点**：
  - 关键指标：`agent_steps_total`、`tool_call_duration_seconds`、`llm_tokens_total{type=prompt|completion}`、`llm_request_duration_seconds`
  - 敏感字段（prompt、tool input）不进 span attributes，只记 hash + length
- **验收**：
  - 本地起 Jaeger + Prometheus，能看到一次 `/agent/run` 的完整调用树
  - `/metrics` 返回 Prometheus 文本格式

## P1-4 持久化层

- **目的**：node-cache 全内存，进程重启丢；无法多实例共享。
- **影响文件**：
  - `src/service/chatService.ts`：将缓存抽象为 `CacheStore` 接口
  - 新增 `src/store/redisCache.ts`（生产）和 `src/store/memoryCache.ts`（当前实现）
  - 新增 `src/store/session.ts`：会话存储（与 P0-1 联动），可选 SQLite（better-sqlite3）或 Redis
  - `src/config/index.ts`：`CACHE_DRIVER=memory|redis`、`REDIS_URL`、`SESSION_DRIVER`
- **要点**：
  - 默认仍是 memory，无 Redis 时不影响启动
  - 会话数据结构：`{session_id, user_id, messages[], created_at, updated_at, ttl}`
  - 序列化统一走 JSON；大字段（tool 结果）做长度截断
- **验收**：
  - 两实例挂 Redis 缓存互通
  - 重启进程后 `session_id` 上下文仍可用

## P1-5 鉴权与多租户

- **目的**：目前限流是全局的，无用户身份，无法计费也无法做人均配额。
- **影响文件**：
  - 新增 `src/auth/apiKey.ts`：Fastify preHandler，从 `Authorization: Bearer` 解析 API Key
  - 新增 `src/store/apiKey.ts`：API Key 存储（初期文件/env，后期 DB）
  - `src/index.ts`：`@fastify/rate-limit` 改为按 `req.user.id` keyGenerator
  - `src/routes/agent.ts` / controllers：从 `req.user` 读取身份并透传给 service
- **要点**：
  - 支持匿名模式（未配置 API Key 表 → 沿用全局限流），便于本地开发
  - Key 落库存哈希（bcrypt / sha256+salt），不存明文
  - 预留 JWT 扩展点（新增 `src/auth/jwt.ts` 但不启用）
- **验收**：
  - 无效 Key → 401
  - 两个 Key 各自限流互不影响
  - 与 P1-3 联动：所有 span 带 `user_id`

## 建议顺序

1. **P1-5** 鉴权（为 P1-3 / P1-4 提供 user 维度）
2. **P1-4** 持久化（为 P1-1 的 MCP session 与 P0-1 会话记忆提供落地）
3. **P1-1** MCP（可与 P1-2 合并：直接接 web-search MCP server）
4. **P1-2** 真实 search（若走 MCP 则被 P1-1 覆盖）
5. **P1-3** 可观测性（最后接入，能覆盖以上所有链路）

## 依赖

- P1-4 依赖 P0-1 的 session 数据模型
- P1-5 阻塞 P3-18（安全护栏需要用户上下文）
- P1-3 依赖 P0-2 的 tool_calls 结构以打准 span
