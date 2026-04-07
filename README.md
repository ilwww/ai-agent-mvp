# ai-node-service

基于 **Fastify + OpenAI SDK** 的轻量 AI 网关服务，对接阿里云 DashScope（Qwen 系列模型），提供同步与 SSE 流式两种对话接口，并内置聊天前端页面。

---

## 功能特性

- `POST /chat` — 同步对话，支持响应缓存（基于 prompt hash）
- `POST /chat-stream` — SSE 流式对话，实时逐字输出
- `GET /` — 内置聊天前端页面，开箱即用
- `GET /health` — 健康检查
- 接口限流（`@fastify/rate-limit`）
- 请求参数 Schema 校验（Fastify + ajv）
- ESLint + Prettier 代码规范

---

## 目录结构

```
ai-node-service/
├── public/
│   └── index.html              # 内置聊天前端页面
├── src/
│   ├── config/index.js         # 环境变量读取与配置
│   ├── model/
│   │   ├── qwen.js             # Qwen Provider（OpenAI Client 封装）
│   │   └── index.js            # Provider 注册表（预留多模型扩展）
│   ├── service/
│   │   └── chatService.js      # 业务逻辑（含缓存）
│   ├── controller/
│   │   ├── chatController.js   # POST /chat 处理器
│   │   └── chatStream.js       # POST /chat-stream 处理器
│   └── index.js                # 服务入口
├── test.mjs                    # 集成测试
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
# 开发模式（文件变更自动重启）
pnpm dev

# 生产模式
pnpm start
```

服务启动后访问 **http://localhost:3131**

---

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|:----:|--------|------|
| `DASHSCOPE_API_KEY` | ✅ | — | 阿里云 DashScope API Key |
| `BASE_URL` | | `https://dashscope.aliyuncs.com/compatible-mode/v1` | API 基础 URL（新加坡地域改为 `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`） |
| `MODEL` | | `qwen3-235b-a22b` | 模型名称（可选 `qwen-plus` / `qwen-max` / `qwen-turbo`） |
| `PORT` | | `3131` | 服务监听端口 |
| `RATE_LIMIT_MAX` | | `60` | 每时间窗口最大请求数 |
| `RATE_LIMIT_WINDOW` | | `1 minute` | 限流时间窗口 |
| `REQUEST_TIMEOUT` | | `30000` | 请求超时（毫秒）|

---

## 接口文档

### `POST /chat`

同步对话，相同 prompt 命中缓存（TTL 5 分钟）直接返回。

**请求**

```json
{ "prompt": "你好，介绍一下北京" }
```

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
{ "prompt": "用三句话介绍上海" }
```

**响应流**

```
data: 上海
data: 是中国最大的城市
data: ……
data: [DONE]
```

异常时推送 `data: [ERROR] <message>` 后关闭连接。

---

### `GET /health`

```json
{ "status": "ok", "timestamp": "2026-04-07T10:00:00.000Z" }
```

---

## 开发命令

```bash
pnpm dev           # 启动开发服务（--watch）
pnpm start         # 启动生产服务
pnpm test          # 运行集成测试（需服务已启动）
pnpm lint          # ESLint 检查
pnpm lint:fix      # ESLint 自动修复
pnpm format        # Prettier 格式化
pnpm format:check  # Prettier 格式检查（CI 使用）
```

---

## 技术栈

| 类别 | 技术 |
|------|------|
| Web 框架 | [Fastify v4](https://fastify.dev) |
| AI SDK | [openai v4](https://github.com/openai/openai-node)（兼容 DashScope） |
| 限流 | @fastify/rate-limit |
| 缓存 | node-cache（内存，TTL 5 分钟） |
| 环境变量 | dotenv |
| 代码规范 | ESLint v9 + Prettier v3 |

---

## License

MIT
