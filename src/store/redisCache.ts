import type { CacheStore } from './types.js';
import { getRedisClient } from './redisClient.js';

const KEY_PREFIX = 'chat:';

/**
 * 基于 ioredis 的 CacheStore 实现。
 * 序列化直接存 string，业务侧自行 JSON.stringify（chatService 存的是完成文本）。
 */
export function createRedisCache(defaultTtlSeconds = 300): CacheStore {
  const client = getRedisClient();
  return {
    async get(key) {
      const val = await client.get(KEY_PREFIX + key);
      return val ?? undefined;
    },
    async set(key, value, ttlSeconds) {
      const ttl = ttlSeconds ?? defaultTtlSeconds;
      await client.set(KEY_PREFIX + key, value, 'EX', ttl);
    },
  };
}
