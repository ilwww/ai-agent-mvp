import type { ServerResponse } from 'node:http';
import type { AgentState, Tool } from './types.js';
import { createInitialState, updateState } from './memory.js';
import { plan } from './planner.js';
import { execute } from './executor.js';
import { sendSSE } from '../protocol/sse.js';

const MAX_STEPS = 10;

export async function runAgent(
  input: string,
  tools: Tool[],
  raw: ServerResponse,
): Promise<void> {
  let state: AgentState = createInitialState(input);
  let step = 0;

  while (step < MAX_STEPS) {
    if (raw.destroyed) break;

    const action = await plan(state, tools);

    sendSSE(
      raw,
      'thought',
      `第 ${step + 1} 步决策：${action.type === 'tool' ? `调用工具 ${action.name}` : '任务完成'}`,
    );

    if (action.type === 'finish') {
      sendSSE(raw, 'done', { output: action.output });
      return;
    }

    // action.type === 'tool'
    sendSSE(raw, 'action', { tool: action.name, input: action.input });

    try {
      const result = await execute(action);
      sendSSE(raw, 'result', { tool: action.name, output: result });
      state = updateState(state, { action, result });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      sendSSE(raw, 'error', { tool: action.name, error: errorMsg });
      state = updateState(state, { action, error: errorMsg });
    }

    step++;
  }

  // 超过 maxSteps 强制结束
  if (!raw.destroyed) {
    sendSSE(raw, 'done', { output: '已达到最大执行步数限制，任务终止。' });
  }
}
