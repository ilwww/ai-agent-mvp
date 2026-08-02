import type { FastifyInstance } from 'fastify';
import type { AgentRunRequest } from '../agent/types.js';
import { runAgent } from '../agent/runtime.js';
import type { SessionContext } from '../agent/runtime.js';
import { getAllTools, getToolsByNames } from '../agent/tools/index.js';
import { initSSE, endSSE } from '../protocol/sse.js';
import { sessionStore } from '../store/index.js';

const agentBodySchema = {
  body: {
    type: 'object',
    required: ['input'],
    properties: {
      input: { type: 'string', minLength: 1 },
      tools: { type: 'array', items: { type: 'string' } },
      session_id: { type: 'string', minLength: 1 },
    },
    additionalProperties: false,
  },
};

/**
 * 判断错误是否为 AbortController.abort 触发。
 *
 * 兼容三种来源：
 * 1. 标准 DOMException（name === 'AbortError'）
 * 2. Node.js 内部（code === 'ABORT_ERR'）
 * 3. OpenAI SDK 的 APIUserAbortError（不显式 set name，因此需要看 constructor.name）
 */
function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: string; constructor?: { name?: string } };
  const ctorName = e.constructor?.name;
  return (
    e.name === 'AbortError' ||
    e.code === 'ABORT_ERR' ||
    ctorName === 'AbortError' ||
    ctorName === 'APIUserAbortError'
  );
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AgentRunRequest }>(
    '/agent/run',
    { schema: agentBodySchema },
    async (request, reply) => {
      const { input, tools: toolNames, session_id: sessionId } = request.body;

      reply.hijack();
      const raw = reply.raw;
      initSSE(raw);

      // 客户端断开连接时 abort 上游 LLM / 工具 fetch。
      // 必须监听 reply.raw（ServerResponse），而不是 request.raw（IncomingMessage）：
      // IncomingMessage 是 POST body 的 Readable，body 读完即 close，会误触发 abort。
      const controller = new AbortController();
      const onClose = (): void => controller.abort();
      raw.on('close', onClose);

      try {
        const tools = toolNames?.length ? getToolsByNames(toolNames) : getAllTools();

        let session: SessionContext | undefined;
        if (sessionId) {
          const existing = await sessionStore.get(sessionId);
          session = {
            id: sessionId,
            store: sessionStore,
            historyTurns: existing?.turns ?? [],
          };
        }

        await runAgent(input, tools, raw, controller.signal, session);
      } catch (err) {
        if (isAbortError(err)) {
          request.log.info('agent/run aborted by client disconnect');
        } else {
          request.log.error({ err }, 'agent/run error');
          if (!raw.destroyed) {
            const message = err instanceof Error ? err.message : String(err);
            raw.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
          }
        }
      } finally {
        raw.off('close', onClose);
        endSSE(raw);
      }
    },
  );
}
