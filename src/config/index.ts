import 'dotenv/config';
import type { Config } from '../types.js';
import { parseMcpServers } from './mcpServers.js';

export { parseMcpServers } from './mcpServers.js';

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
  throw new Error('[config] DASHSCOPE_API_KEY 未配置，请在 .env 中设置 DASHSCOPE_API_KEY');
}

/**
 * 解析整型环境变量，NaN 时抛出明确错误
 */
function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name] ?? String(fallback);
  const val = parseInt(raw, 10);
  if (Number.isNaN(val)) {
    throw new Error(`[config] ${name}="${raw}" 不是合法整数`);
  }
  return val;
}

/**
 * 解析正整数环境变量，NaN / <=0 时抛出明确错误
 */
function parsePositiveIntEnv(name: string, fallback: number): number {
  const val = parseIntEnv(name, fallback);
  if (val <= 0) {
    throw new Error(`[config] ${name}="${val}" 必须为正整数`);
  }
  return val;
}

/**
 * 解析 driver 类型环境变量，仅接受 memory | redis
 */
function parseDriver(name: string, fallback: 'memory' | 'redis'): 'memory' | 'redis' {
  const raw = (process.env[name] ?? fallback).toLowerCase();
  if (raw !== 'memory' && raw !== 'redis') {
    throw new Error(`[config] ${name}="${raw}" 非法，仅支持 memory | redis`);
  }
  return raw;
}

const cacheDriver = parseDriver('CACHE_DRIVER', 'memory');
const sessionDriver = parseDriver('SESSION_DRIVER', 'memory');
const redisUrl = process.env.REDIS_URL;

if ((cacheDriver === 'redis' || sessionDriver === 'redis') && !redisUrl) {
  throw new Error(
    '[config] CACHE_DRIVER 或 SESSION_DRIVER 设为 redis 时必须提供 REDIS_URL',
  );
}

if (process.env.SESSION_MAX_STEPS !== undefined) {
  console.warn(
    '[config] SESSION_MAX_STEPS 已弃用，请改用 SESSION_MAX_TURNS（当前配置将被忽略）',
  );
}

export const config = {
  apiKey,
  baseURL: process.env.BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: process.env.MODEL ?? 'qwen3-235b-a22b',
  deepseekModel: process.env.DEEPSEEK_MODEL ?? 'deepseek-v3.2',
  port: parseIntEnv('PORT', 3131),
  rateLimit: {
    max: parseIntEnv('RATE_LIMIT_MAX', 60),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
  },
  timeout: parseIntEnv('REQUEST_TIMEOUT', 30000),
  cacheDriver,
  sessionDriver,
  redisUrl,
  sessionTtlSeconds: parseIntEnv('SESSION_TTL_SECONDS', 1800),
  sessionMaxTurns: parseIntEnv('SESSION_MAX_TURNS', 20),
  llmMaxRetries: parseIntEnv('LLM_MAX_RETRIES', 2),
  llmRetryBaseMs: parseIntEnv('LLM_RETRY_BASE_MS', 500),
  mcpServers: parseMcpServers(process.env.MCP_SERVERS),
  mcpCallTimeoutMs: parsePositiveIntEnv('MCP_CALL_TIMEOUT_MS', 30000),
  mcpResultMaxChars: parsePositiveIntEnv('MCP_RESULT_MAX_CHARS', 8000),
} satisfies Config;
