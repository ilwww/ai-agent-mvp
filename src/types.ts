import type {
  CreateChatCompletionRequestMessage,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionTool,
  ChatCompletionToolChoiceOption,
} from 'openai/resources/chat/completions.js';
import type { Stream } from 'openai/streaming.js';

/** 全局配置对象类型 */
export interface Config {
  apiKey: string;
  baseURL: string;
  model: string;
  deepseekModel: string;
  port: number;
  rateLimit: {
    max: number;
    timeWindow: string;
  };
  timeout: number;
  /** chat 缓存驱动 */
  cacheDriver: 'memory' | 'redis';
  /** agent 会话驱动 */
  sessionDriver: 'memory' | 'redis';
  /** Redis 连接串，*_DRIVER=redis 时必填 */
  redisUrl?: string;
  /** 会话 TTL（秒） */
  sessionTtlSeconds: number;
  /** 会话最多保留的回合数，超出时截断最早部分 */
  sessionMaxTurns: number;
  /** LLM 调用可重试错误的额外重试次数（不含首次） */
  llmMaxRetries: number;
  /** LLM 调用指数退避的基础延迟（毫秒） */
  llmRetryBaseMs: number;
}

/** 请求体结构（对应 Fastify AJV Schema） */
export interface ChatRequestBody {
  prompt: string;
  model?: 'qwen' | 'deepseek';
  enableThinking?: boolean;
}

/** Provider.chat() 统一入参 */
export interface ChatCallOptions {
  messages: CreateChatCompletionRequestMessage[];
  stream: boolean;
  enableThinking?: boolean;
  /** 传给 LLM 的 function-calling 工具列表；仅 Agent 场景使用 */
  tools?: ChatCompletionTool[];
  /** function-calling 触发策略；默认由供应商决定（通常 'auto'） */
  tool_choice?: ChatCompletionToolChoiceOption;
  /** 用于取消上游 LLM 请求（客户端断连时触发） */
  signal?: AbortSignal;
}

/** Provider 接口 —— 每个模型实现此接口 */
export interface Provider {
  chat(opts: ChatCallOptions): Promise<ChatCompletion | Stream<ChatCompletionChunk>>;
}

/** 非流式调用返回值 */
export interface ChatResult {
  data: string;
  cached: boolean;
}

/**
 * DashScope delta 扩展类型。
 * reasoning_content 是 DashScope 专有字段，不在 OpenAI SDK 类型定义中。
 */
export type DashScopeDelta = ChatCompletionChunk['choices'][number]['delta'] & {
  reasoning_content?: string;
};
