import type { SessionData, SessionStore, SessionTurn } from './types.js';

interface Entry {
  data: SessionData;
  expiresAt: number;
}

/**
 * 会话回合截断策略。
 *
 * 按整个 turn 保留末尾 N 轮；每个 turn 内部的 assistant.tool_calls + role:'tool'
 * 配对自然完整，不会像按 step 切分那样破坏 OpenAI 规范要求的 tool_call_id 关联。
 */
export function truncateTurns(turns: SessionTurn[], maxTurns: number): SessionTurn[] {
  if (turns.length <= maxTurns) return turns;
  return turns.slice(-maxTurns);
}

/**
 * 基于 Map + 惰性清扫的 SessionStore 实现。
 *
 * 单进程可用；TTL 过期在 `get` 时惰性淘汰，避免定时器带来的进程无法退出问题。
 * 生产环境建议切到 redisSession。
 */
export function createMemorySession(
  ttlSeconds: number,
  maxTurns: number,
  now: () => number = Date.now,
): SessionStore {
  const map = new Map<string, Entry>();

  return {
    async get(sessionId) {
      const entry = map.get(sessionId);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        map.delete(sessionId);
        return undefined;
      }
      return entry.data;
    },

    async save(session) {
      const data: SessionData = {
        ...session,
        turns: truncateTurns(session.turns, maxTurns),
        updatedAt: now(),
      };
      map.set(session.sessionId, {
        data,
        expiresAt: now() + ttlSeconds * 1000,
      });
    },

    async delete(sessionId) {
      map.delete(sessionId);
    },
  };
}
