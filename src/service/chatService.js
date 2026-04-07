import crypto from 'node:crypto';
import NodeCache from 'node-cache';
import { defaultProvider } from '../model/index.js';

/** 非流式接口的响应缓存，TTL 5 分钟 */
const cache = new NodeCache({ stdTTL: 300 });

const SYSTEM_PROMPT = '你是一个有帮助的 AI 助手。';

/**
 * 非流式调用：构建 messages，调用模型，返回标准化结果
 * @param {string} prompt 用户输入
 * @param {{ useCache?: boolean }} opts
 * @returns {Promise<{ data: string, cached: boolean }>}
 */
export async function runPrompt(prompt, { useCache = true } = {}) {
  const key = crypto.createHash('sha256').update(prompt).digest('hex');

  if (useCache) {
    const hit = cache.get(key);
    if (hit !== undefined) return { data: hit, cached: true };
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  const resp = await defaultProvider.chat({ messages, stream: false });
  const data = resp.choices[0].message.content ?? '';

  if (useCache) cache.set(key, data);
  return { data, cached: false };
}

/**
 * 流式调用：返回 AsyncIterable stream，由 controller 负责写入响应
 * @param {string} prompt 用户输入
 * @returns {Promise<AsyncIterable>}
 */
export async function runPromptStream(prompt) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];
  return defaultProvider.chat({ messages, stream: true });
}
