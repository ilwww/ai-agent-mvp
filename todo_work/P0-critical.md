# P0 · 阻塞级任务（Critical）

**目标**：让当前 Agent 具备"正确工作"的基础——多轮不失忆、结构化调用不出错、外部失败可恢复、核心逻辑可单测。

## P0-1 会话记忆与多轮上下文回填

- **目的**：`AgentState.messages` 已定义但未真正传给 LLM；导致每个 ReAct 步都从零开始推理，工具结果无法反馈到下一次 plan。
- **影响文件**：
  - `src/agent/types.ts`：`AgentState` 增加会话/回合语义
  - `src/agent/memory.ts`：`updateState` 追加 `assistant` / `tool` 消息
  - `src/agent/planner.ts`：`plan()` 将 `state.messages` 作为 `messages` 传给 LLM，而非仅 system + user
  - `src/agent/runtime.ts`：每步 tool 执行后写入 `tool` 角色消息
- **要点**：
  - 消息角色遵循 OpenAI 规范：`system` / `user` / `assistant` / `tool`
  - `tool` 消息需带 `tool_call_id`（与 P0-2 联动）
  - 引入 `session_id`（HTTP 层从 header 或 body 读取；未指定则单次会话）
- **验收**：
  - 新增单测：连续两步 tool 调用，第二次 plan 的 `messages` 数组包含前一步的 tool 结果
  - 端到端：北京天气 → "那上海呢" 能正确沿用意图

## P0-2 迁移到 OpenAI 原生 function-calling

- **目的**：当前 planner 让 LLM 输出 JSON 字符串再 `JSON.parse`，遇到 markdown 围栏、注释、多余文本就崩；改用原生 `tools` + `tool_choice` 由 SDK 保证结构。
- **影响文件**：
  - `src/agent/planner.ts`：删除自定义 JSON 提取；改为传入 `tools: ChatCompletionTool[]`；读取 `choice.message.tool_calls`
  - `src/agent/types.ts`：`Action` 保留但由 tool_calls 映射得到
  - `src/agent/runtime.ts`：一次 plan 可能返回多个 tool_call（并发执行）
  - `src/model/*.ts`：确认 Qwen / DeepSeek 是否支持 `tools`（Qwen 支持；DeepSeek 通过 DashScope 需验证）
- **要点**：
  - Tool schema 由 `Tool.schema` 直接映射到 `function.parameters`
  - 若模型不返回 tool_calls 而返回 `content`，视为 `finish`
  - 保留 mock 兜底：无 tool_calls + 空 content → 错误
- **验收**：
  - 移除所有 `JSON.parse` fallback 代码
  - 单测：mock provider 返回带 tool_calls 的 chunk，planner 正确产出 `Action`
  - e2e：`test.ts` 中 agent 用例仍通过

## P0-3 LLM 调用重试 / 超时 / AbortController

- **目的**：`config.timeout` 已定义但未落地；网络抖动或 5xx 直接冒泡。
- **影响文件**：
  - `src/model/qwen.ts` / `deepseek.ts`：把 `AbortController` 传给 OpenAI SDK；捕获 `APIConnectionError` / `RateLimitError` 做指数退避重试
  - 新增 `src/model/withRetry.ts`（薄封装，`maxRetries` / `baseDelayMs` 可配置）
  - `src/config/index.ts`：新增 `LLM_MAX_RETRIES` / `LLM_RETRY_BASE_MS`
- **要点**：
  - 只重试幂等的可恢复错误（超时、5xx、429）；4xx 不重试
  - 流式请求首字节前允许重试；开始流式后失败仅上报
  - AbortController 与 Fastify 请求生命周期绑定（客户端断开时 abort）
- **验收**：
  - 单测：mock fetch 前两次抛 429，第三次成功
  - 单测：客户端断连触发 `controller.abort()`，SDK 抛 AbortError 而非 hang

## P0-4 单元测试基础设施

- **目的**：目前只有一份 e2e，无法在 CI 里快速发现回归；planner / executor / registry / provider 都应有 mock 单测。
- **影响文件**：
  - `package.json`：`devDependencies` 增加 `vitest`；`scripts.test:unit` = `vitest run`
  - 新增 `src/**/__tests__/*.test.ts`：
    - `agent/tools/registry.test.ts`
    - `agent/executor.test.ts`（tool 找不到、抛异常）
    - `agent/planner.test.ts`（mock provider）
    - `agent/memory.test.ts`（不可变更新）
    - `model/withRetry.test.ts`
  - `tsconfig.json`：include 增加 test glob
- **要点**：
  - 用 Vitest 而非 Jest（原生 ESM + TS 无需额外配置）
  - 现有 `test.ts` 保留为 `test:e2e`；`test` 脚本改为串行跑单测 + e2e
- **验收**：
  - `pnpm run test:unit` 通过，覆盖率 ≥ 60%
  - CI 里单测执行 < 5 秒

## 建议顺序

1. **P0-1** 会话记忆（为 P0-2 提供 messages 载体）
2. **P0-2** function-calling（依赖 P0-1 的 messages 结构）
3. **P0-4** 单元测试（保护 P0-1/P0-2 的重构成果）
4. **P0-3** 重试/超时（可与 P0-4 并行）
