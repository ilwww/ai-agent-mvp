import OpenAI from 'openai';
import { config } from '../config/index.js';
import type { ChatCallOptions, Provider } from '../types.js';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions.js';
import type { Stream } from 'openai/streaming.js';
import { withRetry } from './withRetry.js';

const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  timeout: config.timeout,
  // 关闭 SDK 内置重试，由 withRetry 统一接管（避免双层重试放大延迟）
  maxRetries: 0,
});

/**
 * 调用 Qwen 模型。
 * enable_thinking 为 DashScope 专有扩展字段，关闭 qwen3 默认思考模式，
 * 确保回答内容正常写入 delta.content。
 * stream 参数以 boolean 传入，不满足 OpenAI SDK 字面量类型重载，需 any 绕过。
 *
 * 429 / 5xx / 网络抖动通过 withRetry 做指数退避；4xx 与已 abort 情况立即抛出。
 */
export const chat: Provider['chat'] = async ({
  messages,
  stream = false,
  tools,
  tool_choice,
  signal,
}: ChatCallOptions): Promise<ChatCompletion | Stream<ChatCompletionChunk>> => {
  const params = {
    model: config.model,
    messages,
    stream,
    // DashScope non-standard field: disables qwen3 default thinking mode
    enable_thinking: false,
    ...(tools ? { tools } : {}),
    ...(tool_choice !== undefined ? { tool_choice } : {}),
  };
  return withRetry(
    () =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.chat.completions.create(params as any, { signal }) as Promise<
        ChatCompletion | Stream<ChatCompletionChunk>
      >,
    {
      maxRetries: config.llmMaxRetries,
      baseDelayMs: config.llmRetryBaseMs,
      signal,
    },
  );
};
