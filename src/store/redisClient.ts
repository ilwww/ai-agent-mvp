import { Redis } from 'ioredis';
import { config } from '../config/index.js';

let client: Redis | undefined;

/**
 * 懒加载共享的 ioredis 客户端。
 *
 * 只有在需要时（首个 redis 版 store 被调用）才建立连接；
 * 首次连接失败即抛错（fail-fast），避免"看起来存了实际没存"的假象。
 */
export function getRedisClient(): Redis {
  if (client) return client;
  if (!config.redisUrl) {
    throw new Error('[redisClient] REDIS_URL 未配置，无法创建 Redis 客户端');
  }
  client = new Redis(config.redisUrl, {
    // 让首次连接错立即抛出而不是无限重试
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  client.on('error', (err: Error) => {
    // 打印但不抛出，避免未捕获的 error 事件把进程带崩；
    // 具体 API 调用失败会各自返回可控错误。
     
    console.error('[redisClient] error:', err.message);
  });
  return client;
}
