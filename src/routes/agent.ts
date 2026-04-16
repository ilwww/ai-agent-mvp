import type { FastifyInstance } from 'fastify';
import type { AgentRunRequest } from '../agent/types.js';
import { runAgent } from '../agent/runtime.js';
import { getAllTools, getToolsByNames } from '../agent/tools/index.js';
import { initSSE, endSSE } from '../protocol/sse.js';

const agentBodySchema = {
  body: {
    type: 'object',
    required: ['input'],
    properties: {
      input: { type: 'string', minLength: 1 },
      tools: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  },
};

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AgentRunRequest }>(
    '/agent/run',
    { schema: agentBodySchema },
    async (request, reply) => {
      const { input, tools: toolNames } = request.body;

      reply.hijack();
      const raw = reply.raw;
      initSSE(raw);

      try {
        const tools = toolNames?.length ? getToolsByNames(toolNames) : getAllTools();
        await runAgent(input, tools, raw);
      } catch (err) {
        request.log.error({ err }, 'agent/run error');
        if (!raw.destroyed) {
          const message = err instanceof Error ? err.message : String(err);
          raw.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
        }
      } finally {
        endSSE(raw);
      }
    },
  );
}
