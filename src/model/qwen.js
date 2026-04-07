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
  });
}
