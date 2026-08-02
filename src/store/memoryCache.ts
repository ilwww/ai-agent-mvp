import NodeCache from 'node-cache';
import type { CacheStore } from './types.js';

/**
 * 基于 node-cache 的进程内 CacheStore 实现。
 * 保持与迁移前 chatService.ts 相同的默认 TTL（300s）。
 */
export function createMemoryCache(defaultTtlSeconds = 300): CacheStore {
  const cache = new NodeCache({ stdTTL: defaultTtlSeconds });
  return {
    async get(key) {
      return cache.get<string>(key);
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds !== undefined) {
        cache.set(key, value, ttlSeconds);
      } else {
        cache.set(key, value);
      }
    },
  };
}
