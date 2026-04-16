/** Tool 调用动作 */
export interface ToolAction {
  type: 'tool';
  name: string;
  input: Record<string, unknown>;
}

/** 完成动作 */
export interface FinishAction {
  type: 'finish';
  output: string;
}

/** Planner 返回的决策 */
export type Action = ToolAction | FinishAction;

/** Tool 接口 */
export interface Tool {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  run(input: Record<string, unknown>): Promise<unknown>;
}

/** 单个执行步骤记录 */
export interface AgentStep {
  action: Action;
  result?: unknown;
  error?: string;
}

/** Agent 状态 */
export interface AgentState {
  messages: Array<{ role: string; content: string }>;
  steps: AgentStep[];
  input: string;
}

/** SSE 事件类型 */
export type SSEEventType = 'thought' | 'action' | 'result' | 'done' | 'error';

/** Agent 运行请求体 */
export interface AgentRunRequest {
  input: string;
  tools?: string[];
}
