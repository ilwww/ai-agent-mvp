# P3 · 工程化加分任务（Nice-to-have）

**目标**：提升交付效率、安全兜底与开发者体验。

## P3-1 Dockerfile / docker-compose / .env.example

- **目的**：目前无标准化交付路径，新环境部署需要手动 `pnpm install` + 配 env。
- **影响文件**：
  - 新增 `Dockerfile`（多阶段：`node:22-alpine` builder → runner；`corepack enable && pnpm install --frozen-lockfile`）
  - 新增 `.dockerignore`
  - 新增 `docker-compose.yml`（app + Redis + Postgres/pgvector + Jaeger + Prometheus，可选启动）
  - 新增 `.env.example`：列出所有 config 变量与默认值
- **要点**：
  - 多阶段构建，最终镜像 < 200MB
  - 非 root 用户运行（`USER node`）
  - Healthcheck 指向 `/health`
- **验收**：`docker compose up` 一键起环境；`curl :3000/health` 返回 ok

## P3-2 CI（GitHub Actions / GitLab CI）

- **目的**：无自动化门禁，人肉跑 lint/typecheck 易漏。
- **影响文件**：
  - 新增 `.github/workflows/ci.yml`：矩阵跑 `pnpm lint` + `pnpm typecheck` + `pnpm test:unit`；e2e 单独 job
  - 新增 `.github/workflows/eval.yml`：定时或手动触发 P2-5 评测
- **要点**：
  - 依赖 P0-4（单测存在）与 P2-5（eval 存在）
  - 使用 `pnpm/action-setup`；缓存 `~/.pnpm-store`
- **验收**：PR 页面能看到 3 个绿色 check

## P3-3 OpenAPI / Swagger UI

- **目的**：无 API 文档，前端与外部调用者需读代码。
- **影响文件**：
  - `package.json`：新增 `@fastify/swagger` + `@fastify/swagger-ui`
  - `src/index.ts`：注册 swagger 插件，从 route schema 自动生成
  - 补齐 `src/routes/agent.ts` 等的 `response` schema（当前只有 body）
- **要点**：
  - Swagger UI 挂 `/docs`；生产环境按需鉴权（读 P1-5 API Key）
  - 生成的 `openapi.json` 也暴露 `/docs/json`
- **验收**：`/docs` 可看到全部 4 个业务接口

## P3-4 流式 cancel / resume

- **目的**：客户端只能被动断连；无主动取消通道，也无重连续传。
- **影响文件**：
  - 新增 `src/routes/agentControl.ts`：`POST /agent/:run_id/cancel`（通过 P1-4 存储中的 AbortSignal 触发）
  - `src/agent/runtime.ts`：每次 SSE 发送前检查 `signal.aborted`
  - `src/protocol/sse.ts`：接受 `Last-Event-ID` 请求头，从存储回放遗漏事件
  - `src/store/eventLog.ts`：短期存储 SSE 事件（Redis List，TTL 5 分钟）
- **要点**：
  - 需分配 `run_id` 并在首个 SSE 事件中下发（`event: meta`）
  - Resume 仅支持"从上次断点接着推"，不重放已完成的 tool 调用
  - 依赖 P0-3 的 AbortController、P1-4 的持久化
- **验收**：手工 curl `--http1.1` 断开 → cancel 接口能中止；再拉 SSE with `Last-Event-ID` 能续上

## P3-5 安全护栏

- **目的**：无 prompt injection 检测、无输出过滤、工具无白名单、无 PII 脱敏。
- **影响文件**：
  - 新增 `src/safety/injection.ts`：启发式 + 关键字规则（`ignore previous instructions` 等）；命中记 warn 并可拒绝
  - 新增 `src/safety/redactor.ts`：日志与 span attributes 走此函数，脱敏邮箱/手机号/身份证
  - 新增 `src/safety/toolPolicy.ts`：按 `req.user.id` 与工具名做 allowlist；`src/agent/executor.ts` 执行前调用
  - 新增 `src/safety/outputFilter.ts`：对最终答案做敏感词/有害内容检查（可对接 DashScope 内容审核 API）
- **要点**：
  - 依赖 P1-5 用户上下文
  - 默认策略：所有用户可用 `getWeather`、`search`、`retrieve`；文件系统类 MCP 工具需显式授予
  - 检测行为可关（`SAFETY_MODE=off|warn|block`）
- **验收**：
  - 单测：注入样例被拦截；PII 在日志中被替换为 `[REDACTED_PHONE]`
  - 未授权用户调用文件工具 → 403

## 建议顺序

1. **P3-1** Docker（无依赖，快速见效）
2. **P3-3** OpenAPI（无依赖）
3. **P3-2** CI（依赖 P0-4 + P2-5）
4. **P3-4** 流控（依赖 P0-3 + P1-4）
5. **P3-5** 安全护栏（依赖 P1-5）
