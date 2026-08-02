import { config } from '../config/index.js';
import type { CacheStore, SessionStore } from './types.js';
import { createMemoryCache } from './memoryCache.js';
import { createMemorySession } from './memorySession.js';
import { createRedisCache } from './redisCache.js';
import { createRedisSession } from './redisSession.js';

/**
 * chat 缓存单例。用于 chatService 的响应缓存。
 * 具体实现由 CACHE_DRIVER 决定：memory（默认）| redis
 */
export const cache: CacheStore =
  config.cacheDriver === 'redis' ? createRedisCache(300) : createMemoryCache(300);

/**
 * agent 会话存储单例。用于 /agent/run 的跨请求记忆。
 * 具体实现由 SESSION_DRIVER 决定。
 */
export const sessionStore: SessionStore =
  config.sessionDriver === 'redis'
    ? createRedisSession(config.sessionTtlSeconds, config.sessionMaxTurns)
    : createMemorySession(config.sessionTtlSeconds, config.sessionMaxTurns);

export type { CacheStore, SessionStore, SessionData, SessionTurn } from './types.js';
