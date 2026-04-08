import OpenAI from 'openai';
import { config } from '../config/index.js';

// 复用与 Qwen 相同的 DashScope 端点和 API Key
const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  timeout: config.timeout,
});

/**
 * 调用 DeepSeek 模型（支持思考模式）
 * @param {{
 *   messages: Array<{role: string, content: string}>,
 *   stream?: boolean,
 *   enableThinking?: boolean
 * }} opts
 */
export async function chat({ messages, stream = false, enableThinking = false }) {
  return client.chat.completions.create({
    model: config.deepseekModel,
    messages,
    stream,
    // stream_options 仅在思考模式下需要（获取 usage chunk 以便识别流结束）
    stream_options: enableThinking ? { include_usage: true } : undefined,
    // enable_thinking 是 DashScope 非标准扩展字段。
    // OpenAI SDK v4.0.0 没有 extra_body 特性，直接放顶层即可——
    // SDK 会原样 JSON.stringify body 对象，未知字段不会被过滤。
    enable_thinking: enableThinking || undefined,
  });
}
