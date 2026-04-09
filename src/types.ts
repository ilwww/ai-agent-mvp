import type { CreateChatCompletionRequestMessage, ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions.js';
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
