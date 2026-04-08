import { runPrompt } from '../service/chatService.js';

/**
 * POST /chat 处理器（非流式）
 * 请求体：{ prompt, model? }
 * 响应：{ success: true, data: string, cached: boolean }
 *      { success: false, error: string }（500）
 */
export async function chatHandler(request, reply) {
  const { prompt, model } = request.body;

  try {
    const result = await runPrompt(prompt, { model });
    return reply.send({ success: true, ...result });
  } catch (err) {
    request.log.error({ err }, 'chatHandler error');
    return reply.status(500).send({ success: false, error: err.message });
  }
}
