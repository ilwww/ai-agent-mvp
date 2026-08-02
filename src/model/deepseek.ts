import OpenAI from 'openai';
import { config } from '../config/index.js';
import type { ChatCallOptions, Provider } from '../types.js';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions.js';
import type { Stream } from 'openai/streaming.js';
import { withRetry } from './withRetry.js';

// 复用与 Qwen 相同的 DashScope 端点和 API Key
const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  timeout: config.timeout,
  // 关闭 SDK 内置重试，由 withRetry 统一接管
  maxRetries: 0,
});

/**
 * 调用 DeepSeek 模型（支持思考模式）。
 * enable_thinking 为 DashScope 专有扩展字段。
 * stream 参数以 boolean 传入，不满足 OpenAI SDK 字面量类型重载，需 any 绕过。
 *
 * 429 / 5xx / 网络抖动通过 withRetry 做指数退避；4xx 与已 abort 情况立即抛出。
 */
export const chat: Provider['chat'] = async ({
  messages,
  stream = false,
  enableThinking = false,
  tools,
  tool_choice,
  signal,
}: ChatCallOptions): Promise<ChatCompletion | Stream<ChatCompletionChunk>> => {
  const params = {
    model: config.deepseekModel,
    messages,
    stream,
    // stream_options 仅在思考模式下需要（获取 usage chunk 以便识别流结束）
    stream_options: enableThinking ? { include_usage: true } : undefined,
    // DashScope non-standard field for DeepSeek thinking mode
    enable_thinking: enableThinking || undefined,
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
