import 'dotenv/config';
import type { Config } from '../types.js';

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
} satisfies Config;
