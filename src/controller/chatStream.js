import { runPromptStream } from '../service/chatService.js';

/**
 * POST /chat-stream 处理器（SSE 流式）
 * 请求体：{ prompt: string }
 * 响应格式：
 *   data: <chunk>\n\n   （每个文字片段）
 *   data: [DONE]\n\n    （正常结束）
 *   data: [ERROR] <msg>\n\n  （异常中断）
 */
export async function chatStreamHandler(request, reply) {
  const { prompt } = request.body;

  // 设置 SSE 响应头
  reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('X-Accel-Buffering', 'no'); // 禁用 nginx 缓冲
  reply.raw.flushHeaders();

  try {
    const stream = await runPromptStream(prompt);

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? '';
      if (content) {
        reply.raw.write(`data: ${content}\n\n`);
      }
    }

    reply.raw.write('data: [DONE]\n\n');
  } catch (err) {
    request.log.error({ err }, 'chatStreamHandler error');
    reply.raw.write(`data: [ERROR] ${err.message}\n\n`);
  } finally {
    reply.raw.end();
  }
}
