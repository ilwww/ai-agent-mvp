import crypto from 'node:crypto';
import NodeCache from 'node-cache';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions.js';
import type { Stream } from 'openai/streaming.js';
import { getProvider } from '../model/index.js';
import type { ChatResult } from '../types.js';

/** 非流式接口的响应缓存，TTL 5 分钟 */
const cache = new NodeCache({ stdTTL: 300 });

const SYSTEM_PROMPT = '你是一个有帮助的 AI 助手。';

/**
 * 非流式调用：构建 messages，调用模型，返回标准化结果
 */
export async function runPrompt(
  prompt: string,
  { useCache = true, model }: { useCache?: boolean; model?: string } = {},
): Promise<ChatResult> {
  // 缓存 key 包含模型名，避免不同模型的结果互相污染
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${model ?? 'default'}:${prompt}`)
    .digest('hex');

  if (useCache) {
    const hit = cache.get<string>(cacheKey);
    if (hit !== undefined) return { data: hit, cached: true };
  }

  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: prompt },
  ];

  const provider = getProvider(model);
  const resp = (await provider.chat({ messages, stream: false })) as ChatCompletion;
  const data = resp.choices[0].message.content ?? '';

  if (useCache) cache.set(cacheKey, data);
  return { data, cached: false };
}

/**
 * 流式调用：返回 AsyncIterable stream，由 controller 负责写入响应
 */
export async function runPromptStream(
  prompt: string,
  { model, enableThinking = false }: { model?: string; enableThinking?: boolean } = {},
): Promise<Stream<ChatCompletionChunk>> {
  const messages = [
    { role: 'system' as const, content: SYSTEM_PROMPT },
    { role: 'user' as const, content: prompt },
  ];
  const provider = getProvider(model);
  return provider.chat({ messages, stream: true, enableThinking }) as Promise<
    Stream<ChatCompletionChunk>
  >;
}
