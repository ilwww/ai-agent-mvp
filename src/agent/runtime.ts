import type { ServerResponse } from 'node:http';
import type { AgentState, Tool, ToolAction } from './types.js';
import { createInitialState, updateState } from './memory.js';
import { plan } from './planner.js';
import { execute } from './executor.js';
import { sendSSE } from '../protocol/sse.js';
import type { SessionStore, SessionTurn } from '../store/types.js';

/**
 * Agent 单次任务允许的最大执行步数
 *
 * 防止 LLM 陷入无限循环或工具调用死循环，
 * 超过此步数后强制结束任务并通过 SSE 通知客户端。
 */
const MAX_STEPS = 10;

const MAX_STEPS_MESSAGE = '已达到最大执行步数限制，任务终止。';

/**
 * 判断链路是否已中止（客户端断开或 AbortController.abort）
 */
function isAborted(raw: ServerResponse, signal?: AbortSignal): boolean {
  return raw.destroyed || (signal?.aborted ?? false);
}

/** 可选的会话上下文；由路由层根据 body.session_id 组装 */
export interface SessionContext {
  id: string;
  store: SessionStore;
  /** 已保存的历史 turn 列表；空数组等同新会话 */
  historyTurns: SessionTurn[];
}

/**
 * 启动并运行一次完整的 Agent 任务
 *
 * 支持：
 * - OpenAI 原生 function-calling：一次 plan 可能返回多个 tool_call，并发执行
 * - AbortSignal 透传：客户端断连时可中止 LLM 与工具的 fetch
 * - 可选 SessionContext：跨请求多轮记忆（按 turn 组织）
 */
export async function runAgent(
  input: string,
  tools: Tool[],
  raw: ServerResponse,
  signal?: AbortSignal,
  session?: SessionContext,
): Promise<void> {
  // state 只承载"当前回合"，历史 turn 由 planner 走 historyTurns 参数展开
  let state: AgentState = createInitialState(input);

  if (session) {
    sendSSE(raw, 'session', {
      session_id: session.id,
      restored_turns: session.historyTurns.length,
    });
  }

  let step = 0;
  let finalOutput: string | undefined;

  while (step < MAX_STEPS) {
    if (isAborted(raw, signal)) return;

    const actions = await plan(state, tools, signal, session?.historyTurns);

    if (isAborted(raw, signal)) return;

    // Finish 分支：LLM 直接给出最终答案
    if (actions.length === 1 && actions[0].type === 'finish') {
      sendSSE(raw, 'thought', `第 ${step + 1} 步决策：任务完成`);
      sendSSE(raw, 'done', { output: actions[0].output });
      finalOutput = actions[0].output;
      break;
    }

    // Tool 分支：一批 ToolAction（可能 1 个或多个）
    const toolActions = actions.filter((a): a is ToolAction => a.type === 'tool');
    const toolNames = toolActions.map((a) => a.name).join(', ');
    sendSSE(raw, 'thought', `第 ${step + 1} 步决策：调用工具 ${toolNames}`);

    for (const action of toolActions) {
      sendSSE(raw, 'action', { id: action.id, tool: action.name, input: action.input });
    }

    const results = await Promise.all(
      toolActions.map(async (action) => {
        try {
          const result = await execute(action, signal);
          return { action, result, error: undefined as string | undefined };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { action, result: undefined as unknown, error: message };
        }
      }),
    );

    if (isAborted(raw, signal)) return;

    for (const { action, result, error } of results) {
      if (error !== undefined) {
        sendSSE(raw, 'error', { tool: action.name, error });
        state = updateState(state, { action, error });
      } else {
        sendSSE(raw, 'result', { tool: action.name, output: result });
        state = updateState(state, { action, result });
      }
    }

    step++;
  }

  // 达到 MAX_STEPS 未 finish：SSE done 兜底提示，并把兜底文案作为 finalOutput
  if (finalOutput === undefined && !isAborted(raw, signal)) {
    sendSSE(raw, 'done', { output: MAX_STEPS_MESSAGE });
    finalOutput = MAX_STEPS_MESSAGE;
  }

  // Abort 时 finalOutput 仍为 undefined，跳过写回
  if (session && finalOutput !== undefined) {
    const newTurn: SessionTurn = {
      userInput: input,
      steps: state.steps,
      finalOutput,
    };
    const now = Date.now();
    await session.store.save({
      sessionId: session.id,
      turns: [...session.historyTurns, newTurn],
      createdAt: now,
      updatedAt: now,
    });
  }
}
