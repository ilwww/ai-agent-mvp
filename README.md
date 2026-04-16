# ai-agent-mvp

基于 **Fastify + OpenAI SDK** 的 AI Agent 服务，对接阿里云 DashScope（Qwen / DeepSeek 系列模型），支持 **Agent ReAct 循环、Tool 调用、SSE 流式过程输出**，同时保留同步与流式对话接口，并内置聊天前端页面。

使用 **TypeScript** 编写，零 TS 错误，ESM 模块。

---

## 功能特性

- `POST /agent/run` — Agent 模式，ReAct 循环决策 + Tool 调用 + SSE 流式过程输出（thought/action/result/done/error）
- `POST /chat` — 同步对话，支持响应缓存（基于 model + prompt hash，不同模型缓存隔离）
- `POST /chat-stream` — SSE 流式对话，实时逐字输出，支持 DeepSeek 思考模式
- `GET /` — 内置聊天前端页面，支持 Qwen / DeepSeek / Agent 三种模式切换
- `GET /health` — 健康检查
- Agent 内置工具：`getWeather`（天气查询）、`search`（关键词搜索），可扩展
- 多模型支持（`qwen` / `deepseek`，可扩展）
- 接口限流（`@fastify/rate-limit`）
- 请求参数 Schema 校验（Fastify + ajv）
- ESLint + Prettier 代码规范

---

## 目录结构

```
ai-agent-mvp/
├── public/
│   └── index.html              # 内置聊天前端页面（支持 Agent 模式）
├── src/
│   ├── types.ts                # 共享类型定义
│   ├── config/index.ts         # 环境变量读取与配置
│   ├── agent/                  # Agent 核心模块
│   │   ├── types.ts            # Agent 类型定义（Action / Tool / AgentState 等）
│   │   ├── runtime.ts          # Agent ReAct 循环
│   │   ├── planner.ts          # Planner（LLM 决策层）
│   │   ├── executor.ts         # Executor（工具执行器）
│   │   ├── memory.ts           # Memory（状态管理）
│   │   └── tools/              # 工具系统
│   │       ├── registry.ts     # 工具注册中心
│   │       ├── weather.ts      # 天气查询工具
│   │       ├── search.ts       # 搜索工具
│   │       └── index.ts        # 工具自动加载
│   ├── protocol/
│   │   └── sse.ts              # SSE 协议封装
│   ├── routes/
│   │   └── agent.ts            # POST /agent/run 路由
│   ├── model/
│   │   ├── index.ts            # Provider 注册表（多模型扩展点）
│   │   ├── qwen.ts             # Qwen Provider（OpenAI Client 封装）
│   │   └── deepseek.ts         # DeepSeek Provider（支持思考模式）
│   ├── service/
│   │   └── chatService.ts      # 业务逻辑（含缓存）
│   ├── controller/
│   │   ├── chatController.ts   # POST /chat 处理器
│   │   └── chatStream.ts       # POST /chat-stream 处理器（SSE）
│   └── index.ts                # 服务入口
├── dist/                       # 生产编译输出（tsc）
├── test.ts                     # 集成测试
├── tsconfig.json               # TypeScript 配置（类型检查）
├── tsconfig.build.json         # TypeScript 编译配置（输出 dist/）
├── eslint.config.js            # ESLint v9 配置
├── .prettierrc                 # Prettier 配置
├── .env.example                # 环境变量模板
└── package.json
```

---

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入真实的 DashScope API Key：

```env
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxx
```

### 3. 启动服务

```bash
# 开发模式（文件变更自动重启，tsx 直接运行 TypeScript）
pnpm dev

# 生产模式（需先编译）
pnpm build
pnpm start
```

服务启动后访问 **http://localhost:3131**

---

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `DASHSCOPE_API_KEY` | ✅ | — | 阿里云 DashScope API Key |
| `BASE_URL` | | `https://dashscope.aliyuncs.com/compatible-mode/v1` | API 基础 URL（新加坡地域改为 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`） |
| `MODEL` | | `qwen3-235b-a22b` | Qwen 模型名称 |
| `DEEPSEEK_MODEL` | | `deepseek-v3.2` | DeepSeek 模型名称 |
| `PORT` | | `3131` | 服务监听端口 |
| `RATE_LIMIT_MAX` | | `60` | 每时间窗口最大请求数 |
| `RATE_LIMIT_WINDOW` | | `1 minute` | 限流时间窗口 |
| `REQUEST_TIMEOUT` | | `30000` | 请求超时（毫秒）|

---

## 接口文档

### `POST /chat`

同步对话，相同 model + prompt 命中缓存（TTL 5 分钟）直接返回。

**请求**

```json
{
  "prompt": "你好，介绍一下北京",
  "model": "qwen"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `prompt` | string | ✅ | 用户输入，不能为空字符串 |
| `model` | string | | `qwen`（默认）或 `deepseek` |

**响应**

```json
{
  "success": true,
  "data": "北京是中华人民共和国的首都……",
  "cached": false
}
```

**错误响应**

```json
{ "success": false, "error": "错误信息" }
```

---

### `POST /chat-stream`

SSE 流式对话，响应头 `Content-Type: text/event-stream`。

**请求**

```json
{
  "prompt": "用三句话介绍上海",
  "model": "deepseek",
  "enableThinking": true
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `prompt` | string | ✅ | 用户输入，不能为空字符串 |
| `model` | string | | `qwen`（默认）或 `deepseek` |
| `enableThinking` | boolean | | 是否开启思考模式（仅 `deepseek` 有效，默认 `false`） |

**响应流**

```
: ping

event: thinking
data: <思考过程片段>

data: 上海是中国最大的城市
data: ……
data: [DONE]
```

| 事件 | 说明 |
|------|------|
| `: ping` | 连接建立确认注释，客户端可忽略 |
| `event: thinking` + `data: ...` | DeepSeek 思考过程（仅 `enableThinking: true` 时出现） |
| `data: ...` | 正式回答内容，按 chunk 实时推送 |
| `data: [DONE]` | 流正常结束 |
| `data: [ERROR] <message>` | 异常中断，包含错误信息 |

---

### `POST /agent/run`

Agent 模式，ReAct 循环自动决策并调用工具，通过 SSE 流式输出执行过程。

**请求**

```json
{
  "input": "北京天气怎么样？",
  "tools": ["getWeather"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `input` | string | ✅ | 用户任务输入，不能为空字符串 |
| `tools` | string[] | | 可选，指定使用的工具名列表；不传则使用全部已注册工具 |

**响应流**

```
: ping

event: thought
data: 第 1 步决策：调用工具 getWeather

event: action
data: {"tool":"getWeather","input":{"city":"北京"}}

event: result
data: {"tool":"getWeather","output":{"temp":25,"weather":"晴"}}

event: thought
data: 第 2 步决策：任务完成

event: done
data: {"output":"北京今天天气晴，气温25度。"}
```

| 事件 | 说明 |
|------|------|
| `event: thought` | Agent 决策思考过程 |
| `event: action` | 工具调用通知（含工具名和参数） |
| `event: result` | 工具执行结果 |
| `event: done` | Agent 任务完成，包含最终回答 |
| `event: error` | 工具执行或运行时错误 |

**内置工具**

| 工具名 | 说明 |
|--------|------|
| `getWeather` | 获取指定城市天气信息（MVP 阶段返回模拟数据） |
| `search` | 搜索指定关键词信息（MVP 阶段返回模拟数据） |

---

### `GET /health`

```json
{ "status": "ok", "timestamp": "2026-04-07T10:00:00.000Z" }
```

---

## 开发命令

```bash
pnpm dev           # 启动开发服务（tsx --watch，无需编译）
pnpm build         # 编译 TypeScript 到 dist/
pnpm start         # 启动生产服务（需先 build）
pnpm typecheck     # TypeScript 类型检查（不输出文件）
pnpm test          # 运行集成测试
pnpm lint          # ESLint 检查
pnpm lint:fix      # ESLint 自动修复
pnpm format        # Prettier 格式化
pnpm format:check  # Prettier 格式检查（CI 使用）
```

---

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | [TypeScript 6](https://www.typescriptlang.org)（ESM，NodeNext 模块解析） |
| Web 框架 | [Fastify v4](https://fastify.dev) |
| AI SDK | [openai v4](https://github.com/openai/openai-node)（兼容 DashScope） |
| 限流 | @fastify/rate-limit |
| 缓存 | node-cache（内存，TTL 5 分钟） |
| 环境变量 | dotenv |
| 开发运行 | [tsx](https://github.com/privatenumber/tsx)（TypeScript 直接执行） |
| 代码规范 | ESLint v9 + typescript-eslint + Prettier v3 |

---

## License

MIT
