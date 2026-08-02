# 模块现状清单

## 一、已实现模块

| 层次 | 文件 / 目录 | 能力 |
|------|-------------|------|
| HTTP 框架 | `src/index.ts` | Fastify v4、限流、Ajv 请求校验、静态 HTML、健康检查 |
| 配置 | `src/config/index.ts` | dotenv、必填校验（DASHSCOPE_API_KEY）、默认值 |
| 模型 Provider | `src/model/{qwen,deepseek,index}.ts` | OpenAI SDK 兼容 DashScope；双模型选择；DeepSeek thinking |
| 同步聊天 | `src/controller/chatController.ts` + `src/service/chatService.ts` | SHA256 缓存键、5 分钟 TTL、按模型隔离 |
| 流式聊天 | `src/controller/chatStream.ts` + `src/protocol/sse.ts` | SSE 协议封装、断连感知、thinking 事件透传 |
| Agent 运行时 | `src/agent/runtime.ts` | ReAct 循环、MAX_STEPS=10、SSE 事件流 |
| Agent Planner | `src/agent/planner.ts` | 系统提示词构造、LLM 响应解析为 Action JSON |
| Agent Executor | `src/agent/executor.ts` | 从注册表查找并执行工具 |
| Agent 状态 | `src/agent/memory.ts` + `types.ts` | 不可变 state 更新（`updateState`） |
| 工具注册表 | `src/agent/tools/registry.ts` | `registerTool` / `getTool` / `getAllTools` / `getToolsByNames` |
| 内置工具 | `src/agent/tools/{weather,search}.ts` | `getWeather`（真实 Open-Meteo）、`search`（Mock） |
| 路由 | `src/routes/agent.ts` | `POST /agent/run`（SSE） |
| 前端 | `public/index.html` | 单页聊天 UI |
| 测试 | `test.ts` + `test/wait-ready.ts` | 19 条 e2e 用例、自定义 SSE 解析、参数校验 |
| 工程化 | `eslint.config.js` / `tsconfig*.json` / `package.json` | ESLint 9 + Prettier 3 + strict TS |

## 二、缺失模块（对照表）

| # | 缺失项 | 影响 / 原因 | 归属 |
|---|--------|--------------|------|
| 1 | 会话记忆 / 多轮上下文回填 | `AgentState.messages` 未真正拼给 LLM，Agent 每步"失忆" | **P0** |
| 2 | 原生 function-calling | 依赖 LLM 输出 JSON 字符串再手工 parse，鲁棒性差 | **P0** |
| 3 | LLM 调用重试 / 超时 / AbortController | 网络抖动直接失败；`config.timeout` 未真正落地 | **P0** |
| 4 | 单元测试 | 只有 e2e，planner/executor/registry/provider 无 mock 单测 | **P0** |
| 5 | MCP（Model Context Protocol） | 无法接入生态第三方工具服务器 | **P1** |
| 6 | 真实 search 工具 | 当前 mock，Agent 检索能力名存实亡 | **P1** |
| 7 | 可观测性（request-id / OTel / metrics） | 生产不可运维、无法定位问题 | **P1** |
| 8 | 持久化层 | node-cache 全内存，重启即失，无法共享 | **P1** |
| 9 | 鉴权与多租户 | 无 API Key、无用户体系，限流是全局 | **P1** |
| 10 | RAG / 长期记忆 | 无向量库、无文档摄取、无检索工具，Agent 无领域知识 | **P2** |
| 11 | Prompt 模板管理 | system prompt 硬编码在 `planner.ts`，无变量注入 / 版本 | **P2** |
| 12 | Token / 成本追踪 | 无 usage 累计、无按会话/用户维度计费 | **P2** |
| 13 | 子 Agent / Plan-and-Execute / Reflection | 只有单层 ReAct，复杂任务分解能力不足 | **P2** |
| 14 | 评测集（golden set / regression） | 无法量化改动收益 | **P2** |
| 15 | Dockerfile / CI | 无标准化交付路径 | **P3** |
| 16 | OpenAPI / Swagger UI | 无 API 自动化文档 | **P3** |
| 17 | 流式 cancel / resume | 客户端只能被动断连，无主动中止/续传 | **P3** |
| 18 | 安全护栏（prompt injection / 输出过滤 / 工具白名单 / PII） | 无安全兜底 | **P3** |

## 三、依赖关系概览

```
P0-1 会话记忆 ──┐
                ├─▶ P2-13 子 Agent / Plan-and-Execute
P0-2 function-calling
P0-3 重试超时
P0-4 单元测试   ──▶ P2-14 评测集

P1-5 MCP        ──▶ P1-6 真实 search（可作为 MCP 服务器接入）
P1-7 可观测性   ──▶ P2-12 成本追踪
P1-8 持久化     ──┬─▶ P2-10 RAG（向量库）
                  └─▶ P1-9 鉴权（用户表）

P3-15 Docker/CI 独立
P3-16 OpenAPI 独立
P3-17 流控 依赖 P0-3
P3-18 安全护栏 依赖 P1-9（多租户上下文）
```
