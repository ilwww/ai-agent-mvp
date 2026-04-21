import type { ServerResponse } from 'node:http';
import type { AgentState, Tool } from './types.js';
import { createInitialState, updateState } from './memory.js';
import { plan } from './planner.js';
import { execute } from './executor.js';
import { sendSSE } from '../protocol/sse.js';

/**
 * Agent 单次任务允许的最大执行步数
 *
 * 防止 LLM 陷入无限循环或工具调用死循环，
 * 超过此步数后强制结束任务并通过 SSE 通知客户端。
 */
const MAX_STEPS = 10;

/**
 * 启动并运行一次完整的 Agent 任务
 *
 * 核心执行循环：
 * 1. 调用 `plan` 获取 LLM 决策（ToolAction 或 FinishAction）
 * 2. 通过 SSE 推送 `thought` 事件告知客户端当前决策
 * 3. 若决策为 `finish`，推送 `done` 事件并结束
 * 4. 若决策为 `tool`，推送 `action` 事件 → 执行工具 → 推送 `result`/`error` 事件
 * 5. 将本步骤结果追加到 state，进入下一轮循环
 * 6. 超过 MAX_STEPS 后强制推送 `done` 事件终止任务
 *
 * SSE 事件说明：
 * - `thought`：每步决策的文字说明
 * - `action`：即将调用的工具名和入参
 * - `result`：工具执行成功的输出
 * - `error`：工具执行失败的错误信息
 * - `done`：任务结束，携带最终回答
 *
 * @param input 用户输入的任务描述
 * @param tools 本次任务可使用的工具列表
 * @param raw   Node.js HTTP ServerResponse，用于向客户端推送 SSE 事件
 * @returns Promise<void>，任务结束或连接断开时 resolve
 *
 * @example
 * import { getAllTools } from './tools/index.js';
 *
 * // 在 HTTP 请求处理器中启动 Agent
 * app.get('/api/agent/run', async (req, res) => {
 *   res.setHeader('Content-Type', 'text/event-stream');
 *   await runAgent('北京今天天气怎么样？', getAllTools(), res);
 *   res.end();
 * });
 *
 * // 客户端将依次收到如下 SSE 事件：
 * // event: thought  data: "第 1 步决策：调用工具 getWeather"
 * // event: action   data: {"tool":"getWeather","input":{"city":"北京"}}
 * // event: result   data: {"tool":"getWeather","output":{"city":"北京","temperature":28,...}}
 * // event: thought  data: "第 2 步决策：任务完成"
 * // event: done     data: {"output":"北京今天晴，气温 28°C，东南风 3 级。"}
 */
export async function runAgent(
  input: string,
  tools: Tool[],
  raw: ServerResponse,
): Promise<void> {
  let state: AgentState = createInitialState(input);
  let step = 0;

  while (step < MAX_STEPS) {
    // 若客户端已断开连接，提前终止循环避免无效执行
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

    // action.type === 'tool'：推送动作事件后执行工具
    sendSSE(raw, 'action', { tool: action.name, input: action.input });

    try {
      const result = await execute(action);
      sendSSE(raw, 'result', { tool: action.name, output: result });
      state = updateState(state, { action, result });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      sendSSE(raw, 'error', { tool: action.name, error: errorMsg });
      // 即使工具执行失败，也将错误信息记录到 state，让 LLM 下一步可感知错误
      state = updateState(state, { action, error: errorMsg });
    }

    step++;
  }

  // 超过 MAX_STEPS 强制结束，防止无限循环
  if (!raw.destroyed) {
    sendSSE(raw, 'done', { output: '已达到最大执行步数限制，任务终止。' });
  }
}
