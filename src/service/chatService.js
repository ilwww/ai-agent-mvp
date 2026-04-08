import crypto from 'node:crypto';
import NodeCache from 'node-cache';
import { getProvider } from '../model/index.js';

/** 非流式接口的响应缓存，TTL 5 分钟 */
const cache = new NodeCache({ stdTTL: 300 });

const SYSTEM_PROMPT = '你是一个有帮助的 AI 助手。';

/**
 * 非流式调用：构建 messages，调用模型，返回标准化结果
 * @param {string} prompt 用户输入
 * @param {{ useCache?: boolean, model?: string }} opts
 * @returns {Promise<{ data: string, cached: boolean }>}
 */
export async function runPrompt(prompt, { useCache = true, model } = {}) {
  // 缓存 key 包含模型名，避免不同模型的结果互相污染
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${model ?? 'default'}:${prompt}`)
    .digest('hex');

  if (useCache) {
    const hit = cache.get(cacheKey);
    if (hit !== undefined) return { data: hit, cached: true };
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];

  const provider = getProvider(model);
  const resp = await provider.chat({ messages, stream: false });
  const data = resp.choices[0].message.content ?? '';

  if (useCache) cache.set(cacheKey, data);
  return { data, cached: false };
}

/**
 * 流式调用：返回 AsyncIterable stream，由 controller 负责写入响应
 * @param {string} prompt 用户输入
 * @param {{ model?: string, enableThinking?: boolean }} opts
 * @returns {Promise<AsyncIterable>}
 */
export async function runPromptStream(prompt, { model, enableThinking = false } = {}) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ];
  const provider = getProvider(model);
  return provider.chat({ messages, stream: true, enableThinking });
}
