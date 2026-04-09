import OpenAI from 'openai';
import { config } from '../config/index.js';
import type { ChatCallOptions, Provider } from '../types.js';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions.js';
import type { Stream } from 'openai/streaming.js';

const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  timeout: config.timeout,
});

/**
 * 调用 Qwen 模型。
 * enable_thinking 为 DashScope 专有扩展字段，关闭 qwen3 默认思考模式，
 * 确保回答内容正常写入 delta.content。
 * stream 参数以 boolean 传入，不满足 OpenAI SDK 字面量类型重载，需 any 绕过。
 */
export const chat: Provider['chat'] = async ({
  messages,
  stream = false,
}: ChatCallOptions): Promise<ChatCompletion | Stream<ChatCompletionChunk>> => {
  const params = {
    model: config.model,
    messages,
    stream,
    // DashScope non-standard field: disables qwen3 default thinking mode
    enable_thinking: false,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return client.chat.completions.create(params as any) as Promise<
    ChatCompletion | Stream<ChatCompletionChunk>
  >;
};
