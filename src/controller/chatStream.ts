import type { FastifyRequest, FastifyReply } from 'fastify';
import { runPromptStream } from '../service/chatService.js';
import type { ChatRequestBody, DashScopeDelta } from '../types.js';

/**
 * 将多行文本编码为合法的 SSE data 字段序列。
 * SSE 规范要求每个 data: 字段只能占一行，内容含 \n 时须拆分。
 */
function encodeSSEData(text: string): string {
  return text
    .split('\n')
    .map((line) => `data: ${line}`)
    .join('\n');
}

/**
 * POST /chat-stream 处理器（SSE 流式）
 * 请求体：{ prompt, model?, enableThinking? }
 *
 * 设计要点：
 * - async handler + reply.hijack()：Fastify 的 wrapThenable 检测到 kReplyHijacked
 *   后会直接 return，不会在 handler promise resolve 后干预响应。
 * - 仅用 raw.destroyed 检测连接断开，不监听 request.raw 的 close 事件
 *   （该事件在请求体被 Fastify 消费后可能提前触发，导致写入被跳过）。
 *
 * SSE 输出格式：
 *   event: thinking\ndata: <思考片段>\n\n   （DeepSeek 思考过程，可选）
 *   data: <回答片段>\n\n                     （正式回答内容）
 *   data: [DONE]\n\n                         （正常结束）
 *   data: [ERROR] <msg>\n\n                  （异常中断）
 */
export async function chatStreamHandler(
  request: FastifyRequest<{ Body: ChatRequestBody }>,
  reply: FastifyReply,
): Promise<void> {
  const { prompt, model, enableThinking = false } = request.body;

  // 接管响应，阻止 Fastify 在 handler promise resolve 后调用 reply.send()
  reply.hijack();

  const raw = reply.raw;
  raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // SSE 注释帧：确保 chunked 编码立即建立，客户端确认连接活跃
  raw.write(': ping\n\n');

  try {
    const stream = await runPromptStream(prompt, { model, enableThinking });

    for await (const chunk of stream) {
      if (raw.destroyed) break;

      // usage-only chunk（enable_thinking 时末尾会出现 choices 为空的 chunk）
      if (!chunk.choices?.length) continue;

      const delta = chunk.choices[0].delta as DashScopeDelta;

      // 思考内容 → event: thinking
      if (delta.reasoning_content) {
        raw.write(`event: thinking\n${encodeSSEData(delta.reasoning_content)}\n\n`);
      }

      // 正式回答 → 普通 data 事件
      if (delta.content) {
        raw.write(`${encodeSSEData(delta.content)}\n\n`);
      }
    }

    if (!raw.destroyed) {
      raw.write('data: [DONE]\n\n');
    }
  } catch (err) {
    request.log.error({ err }, 'chatStreamHandler error');
    if (!raw.destroyed) {
      const message = err instanceof Error ? err.message : String(err);
      raw.write(`data: [ERROR] ${message}\n\n`);
    }
  } finally {
    if (!raw.destroyed) raw.end();
  }
}
