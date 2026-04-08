import OpenAI from 'openai';
import { config } from '../config/index.js';

const client = new OpenAI({
  apiKey: config.apiKey,
  baseURL: config.baseURL,
  timeout: config.timeout,
});

/**
 * 调用 Qwen 模型
 * @param {{ messages: Array<{role: string, content: string}>, stream?: boolean }} opts
 * @returns {Promise<import('openai').ChatCompletion | AsyncIterable>}
 */
export async function chat({ messages, stream = false }) {
  return client.chat.completions.create({
    model: config.model,
    messages,
    stream,
    // qwen3 系列默认开启思考模式，thinking 内容走 delta.reasoning_content，
    // delta.content 全程为空字符串，导致 SSE 流无有效输出。
    // 显式关闭思考模式，确保回答内容正常写入 delta.content。
    // OpenAI SDK v4.0.0 没有 extra_body，直接放顶层即可。
    enable_thinking: false,
  });
}
