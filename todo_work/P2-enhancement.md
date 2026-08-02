# P2 · 能力扩展任务（Enhancement）

**目标**：突破单轮 ReAct 上限，引入知识、治理与量化评估，让 Agent 更聪明、更可控。

## P2-1 RAG / 长期记忆

- **目的**：让 Agent 具备领域知识与长期记忆能力，超越模型训练截止时间。
- **影响文件**：
  - 新增 `src/rag/vectorStore.ts`：向量库抽象（默认 pgvector / Qdrant / Chroma 三选一）
  - 新增 `src/rag/embedding.ts`：Embedding 服务（DashScope `text-embedding-v3` 或 OpenAI `text-embedding-3-small`）
  - 新增 `src/rag/ingest.ts`：文档摄取 pipeline（load → split → embed → upsert）
  - 新增 `src/agent/tools/retrieve.ts`：检索工具，注册进 registry
  - 新增 `src/routes/rag.ts`：`POST /rag/ingest` 上传文档；`POST /rag/search` 直接检索
- **要点**：
  - 切分策略：递归字符切分（默认 chunk_size=800, overlap=100）
  - 支持 Markdown / PDF / 纯文本；PDF 用 `pdf-parse`
  - 检索工具 top_k 默认 5，rerank 可后续接入 `bge-reranker`
  - 与 P1-4 持久化联动：向量库连接串走同一 config
- **验收**：
  - 摄取 README.md → Agent 能回答"这个项目用什么框架"并给出源引用

## P2-2 Prompt 模板管理

- **目的**：`planner.ts` 中 system prompt 硬编码；改动需重启，无版本管理。
- **影响文件**：
  - 新增 `src/prompts/` 目录，每个 prompt 一个 `.md` 文件（YAML frontmatter 声明变量）
  - 新增 `src/prompts/loader.ts`：启动时加载、编译 `{{var}}` 占位；支持热重载（dev 模式监听 fs）
  - `src/agent/planner.ts`：改为 `renderPrompt('planner.system', { tools, date })`
- **要点**：
  - 采用 `{{var}}` 而非完整模板引擎，避免注入攻击
  - 版本号写在 frontmatter；日志中记录使用的 prompt 版本
- **验收**：
  - 修改 `.md` 文件后无需重启即可生效（dev）
  - 单测：变量渲染、缺失变量报错

## P2-3 Token 与成本追踪

- **目的**：无 usage 累计，无法做成本归因与预算控制。
- **影响文件**：
  - 新增 `src/observability/usage.ts`：从每次 LLM 响应的 `usage` 字段累计 prompt/completion tokens
  - `src/model/*.ts`：流式响应开启 `stream_options: { include_usage: true }`（Qwen 已开，DeepSeek 补齐）
  - 新增 `src/store/usageStore.ts`：按 `user_id + model + date` 落 DB
  - 新增 `src/routes/usage.ts`：`GET /usage`（当前用户查询）
- **要点**：
  - 单价表内置常见模型（Qwen-plus / DeepSeek-chat），可通过 env 覆盖
  - 每次请求响应头加 `X-Usage-Tokens: prompt=xx,completion=yy`
  - 与 P1-3 metrics 联动：`llm_tokens_total` 已在 P1-3 定义，此处补充落库
- **验收**：
  - `GET /usage` 返回当日累计
  - Prometheus 指标与 DB 数据在 5% 内对齐

## P2-4 子 Agent / Plan-and-Execute / Reflection

- **目的**：当前单层 ReAct 对复杂任务（跨领域、需要中间总结）能力有限。
- **影响文件**：
  - 新增 `src/agent/orchestrator/planExecute.ts`：先生成任务列表，再逐项执行
  - 新增 `src/agent/orchestrator/subAgent.ts`：子 Agent 抽象（同 Tool 接口暴露，父 Agent 把它当工具调用）
  - 新增 `src/agent/orchestrator/reflection.ts`：完成后对结果自评并可回滚重试
  - `src/agent/runtime.ts`：新增策略参数 `strategy: 'react' | 'plan-execute'`（默认 react 保持兼容）
- **要点**：
  - 子 Agent 独立 session_id，避免上下文污染父 Agent
  - Reflection 最多重试 2 次，否则接受当前结果
  - SSE 事件加 `agent_depth` 字段区分父/子
- **验收**：
  - "帮我调研 X 并写一份 200 字总结" 场景：plan-execute 优于 react（更少幻觉、更完整）
  - 单测：mock LLM 输出多任务 plan，orchestrator 正确调度

## P2-5 评测集（golden set / regression）

- **目的**：没有量化指标就没有改进依据。
- **影响文件**：
  - 新增 `eval/` 目录（同级 `src/`），包含 `cases/*.json`（每条：`{input, expected_tools[], expected_answer_contains[]}`）
  - 新增 `eval/runner.ts`：批量跑 `POST /agent/run`，抓 SSE 事件流，比对期望
  - 新增 `pnpm run eval` 脚本
- **要点**：
  - 指标：`tool_call_accuracy`（调用工具集合是否命中）、`answer_hit_rate`（答案是否包含关键字）、`avg_steps`、`avg_latency`、`avg_tokens`
  - 结果 JSON + 简易 HTML 报告
  - CI 里跑（可选）：与 P3-CI 联动
- **验收**：
  - 初始 15 条用例，跑通并生成报告
  - PR 中报告可 diff 前后指标

## 建议顺序

1. **P2-2** Prompt 模板（最轻，为后续 orchestrator/RAG 提供模板治理）
2. **P2-1** RAG（依赖 P1-4 持久化）
3. **P2-4** 子 Agent（依赖 P2-2 的模板管理）
4. **P2-3** 成本追踪（依赖 P1-3 metrics）
5. **P2-5** 评测（依赖 P0-4 单测基建；用于验证 P2-1/P2-4 效果）
