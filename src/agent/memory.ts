import type { AgentState, AgentStep } from './types.js';

/**
 * 创建 Agent 的初始运行状态
 *
 * 在每次新任务开始时调用，返回一个干净的 AgentState，
 * messages 和 steps 均为空数组，等待 Planner 逐步填充。
 *
 * @param input 用户输入的原始任务描述
 * @returns 初始化的 AgentState 对象
 *
 * @example
 * const state = createInitialState('北京今天天气怎么样？');
 * // => {
 * //   input: '北京今天天气怎么样？',
 * //   messages: [],
 * //   steps: [],
 * // }
 */
export function createInitialState(input: string): AgentState {
  return {
    input,
    messages: [],
    steps: [],
  };
}

/**
 * 将一个执行步骤追加到 Agent 状态中，返回新的状态副本
 *
 * 采用不可变更新模式（展开运算符），不修改原始 state，
 * 确保每一步状态变更都可追溯。
 *
 * @param state 当前 Agent 状态
 * @param step  本次执行完成的步骤记录（包含 action 和 result/error）
 * @returns 包含新步骤的 AgentState 副本
 *
 * @example
 * const step: AgentStep = {
 *   action: { type: 'tool', name: 'search', input: { query: 'AI Agent' } },
 *   result: { results: ['结果1', '结果2'] },
 * };
 * const newState = updateState(state, step);
 * // newState.steps.length === state.steps.length + 1
 */
export function updateState(state: AgentState, step: AgentStep): AgentState {
  return {
    ...state,
    steps: [...state.steps, step],
  };
}
