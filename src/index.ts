import { fastify as Fastify } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from './config/index.js';
import { chatHandler } from './controller/chatController.js';
import { chatStreamHandler } from './controller/chatStream.js';
import type { ChatRequestBody } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 启动时读取 index.html（一次性读入内存，避免每次请求 I/O）
const indexHtml = readFileSync(join(__dirname, '..', 'public', 'index.html'), 'utf8');

const app = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      // 关闭静默移除，让 additionalProperties: false 真正拒绝多余字段（返回 400）
      removeAdditional: false,
    },
  },
});

// 限流插件
await app.register(rateLimit, {
  max: config.rateLimit.max,
  timeWindow: config.rateLimit.timeWindow,
});

// 请求体 Schema：prompt 必填，model / enableThinking 可选
const chatBodySchema = {
  body: {
    type: 'object',
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', minLength: 1 },
      model: { type: 'string', enum: ['qwen', 'deepseek'] },
      enableThinking: { type: 'boolean' },
    },
    additionalProperties: false,
  },
};

// 路由注册
app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
  return reply.type('text/html; charset=utf-8').send(indexHtml);
});

app.post<{ Body: ChatRequestBody }>('/chat', { schema: chatBodySchema }, chatHandler);
app.post<{ Body: ChatRequestBody }>('/chat-stream', { schema: chatBodySchema }, chatStreamHandler);
app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// 启动服务
try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
