import 'dotenv/config';

const apiKey = process.env.DASHSCOPE_API_KEY;
if (!apiKey) {
  throw new Error('[config] DASHSCOPE_API_KEY 未配置，请在 .env 中设置 DASHSCOPE_API_KEY');
}

export const config = {
  apiKey,
  baseURL: process.env.BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: process.env.MODEL ?? 'qwen3-235b-a22b',
  port: parseInt(process.env.PORT ?? '3131', 10),
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '60', 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? '1 minute',
  },
  timeout: parseInt(process.env.REQUEST_TIMEOUT ?? '30000', 10),
};
