import type { SessionData, SessionStore } from './types.js';
import { truncateTurns } from './memorySession.js';
import { getRedisClient } from './redisClient.js';

const KEY_PREFIX = 'agent:session:';

/**
 * 基于 ioredis 的 SessionStore 实现。
 *
 * 序列化：JSON。读写失败按可恢复错误处理：
 * - get: 反序列化失败或数据结构不含 `turns` 字段时删除脏数据并返回 undefined
 * - save: 记录 warn 日志但不抛，避免会话丢失连累业务失败
 */
export function createRedisSession(ttlSeconds: number, maxTurns: number): SessionStore {
  const client = getRedisClient();

  return {
    async get(sessionId) {
      const raw = await client.get(KEY_PREFIX + sessionId);
      if (!raw) return undefined;
      try {
        const parsed = JSON.parse(raw) as SessionData;
        // 老格式（含 steps 字段而无 turns）视为脏数据丢弃
        if (!Array.isArray((parsed as unknown as { turns?: unknown }).turns)) {
          console.warn(`[redisSession] 老格式数据丢弃: ${sessionId}`);
          await client.del(KEY_PREFIX + sessionId);
          return undefined;
        }
        return parsed;
      } catch (err) {
        console.warn(`[redisSession] 反序列化失败，清理脏数据: ${sessionId}`, err);
        await client.del(KEY_PREFIX + sessionId);
        return undefined;
      }
    },

    async save(session) {
      const data: SessionData = {
        ...session,
        turns: truncateTurns(session.turns, maxTurns),
        updatedAt: Date.now(),
      };
      try {
        const payload = JSON.stringify(data);
        await client.set(KEY_PREFIX + session.sessionId, payload, 'EX', ttlSeconds);
      } catch (err) {
        console.warn(`[redisSession] save 失败，会话将丢失: ${session.sessionId}`, err);
      }
    },

    async delete(sessionId) {
      await client.del(KEY_PREFIX + sessionId);
    },
  };
}
