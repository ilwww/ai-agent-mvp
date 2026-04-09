import type { FastifyRequest, FastifyReply } from 'fastify';
import { runPrompt } from '../service/chatService.js';
import type { ChatRequestBody } from '../types.js';

/**
 * POST /chat 处理器（非流式）
 * 请求体：{ prompt, model? }
 * 响应：{ success: true, data: string, cached: boolean }
 *      { success: false, error: string }（500）
 */
export async function chatHandler(
  request: FastifyRequest<{ Body: ChatRequestBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { prompt, model } = request.body;

  try {
    const result = await runPrompt(prompt, { model });
    await reply.send({ success: true, ...result });
  } catch (err) {
    request.log.error({ err }, 'chatHandler error');
    const message = err instanceof Error ? err.message : String(err);
    await reply.status(500).send({ success: false, error: message });
  }
}
