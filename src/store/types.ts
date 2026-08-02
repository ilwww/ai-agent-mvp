import type { AgentStep } from '../agent/types.js';

/**
 * 通用 KV 缓存接口。
 * 用于替代目前 chatService.ts 里硬编码的 NodeCache 单例，
 * 由 config 决定实际实现（memory | redis）。
 */
export interface CacheStore {
  /** 命中返回原字符串；未命中或过期返回 undefined */
  get(key: string): Promise<string | undefined>;
  /**
   * 写入缓存。
   * @param ttlSeconds 秒级 TTL；不传时使用实现默认值
   */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
}

/**
 * 会话的单个回合。
 *
 * 每次 `/agent/run` 完成后（不论是 finish 还是 MAX_STEPS 兜底）
 * 都会追加一个 SessionTurn，包含：
 * - 用户输入
 * - 本回合内 LLM 做过的 tool 调用步骤
 * - 本回合的最终答复（用于下一轮 buildMessages 里作为 assistant.content）
 */
export interface SessionTurn {
  userInput: string;
  steps: AgentStep[];
  finalOutput: string;
}

/**
 * Agent 会话数据结构。
 * 由 turns 数组承载多轮对话；planner 会展开每个 turn 为
 * user → assistant.tool_calls / tool → assistant.content 消息序列。
 */
export interface SessionData {
  sessionId: string;
  /** 预留 P1-5 鉴权字段；本次不强制 */
  userId?: string;
  turns: SessionTurn[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Agent 跨请求会话存储。
 * memory 实现基于 Map + TTL sweep；redis 实现用 SET EX。
 */
export interface SessionStore {
  /** 未找到或已过期时返回 undefined，不抛错 */
  get(sessionId: string): Promise<SessionData | undefined>;
  /** 全量覆盖写入；实现内部按 TTL 刷新过期时间 */
  save(session: SessionData): Promise<void>;
  /** 删除会话；不存在也不报错（幂等） */
  delete(sessionId: string): Promise<void>;
}
