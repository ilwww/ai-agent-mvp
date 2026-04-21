/**
 * Tool 调用动作
 * 当 Planner 决策需要调用某个工具时返回此类型
 *
 * @example
 * const action: ToolAction = {
 *   type: 'tool',
 *   name: 'search',
 *   input: { query: 'TypeScript 最佳实践' },
 * };
 */
export interface ToolAction {
  /** 动作类型，固定为 'tool' */
  type: 'tool';
  /** 要调用的工具名称，需在 registry 中已注册 */
  name: string;
  /** 传递给工具 run 方法的参数对象 */
  input: Record<string, unknown>;
}

/**
 * 完成动作
 * 当 Planner 判断任务已完成、无需再调用工具时返回此类型
 *
 * @example
 * const action: FinishAction = {
 *   type: 'finish',
 *   output: '北京今天晴，气温 28°C，东南风 3 级。',
 * };
 */
export interface FinishAction {
  /** 动作类型，固定为 'finish' */
  type: 'finish';
  /** 向用户输出的最终回答内容 */
  output: string;
}

/**
 * Planner 返回的决策联合类型
 * - 若需要调用工具，则为 ToolAction
 * - 若任务已完成，则为 FinishAction
 */
export type Action = ToolAction | FinishAction;

/**
 * Tool 接口
 * 所有工具必须实现此接口并通过 registerTool 注册后才能被 Agent 使用
 *
 * @example
 * const myTool: Tool = {
 *   name: 'calculator',
 *   description: '执行简单的数学计算',
 *   schema: {
 *     type: 'object',
 *     properties: { expression: { type: 'string', description: '数学表达式' } },
 *     required: ['expression'],
 *   },
 *   async run(input) {
 *     return { result: eval(input.expression as string) };
 *   },
 * };
 */
export interface Tool {
  /** 工具的唯一标识名称，用于在 registry 中注册和查找 */
  name: string;
  /** 工具功能的自然语言描述，会被注入到 Planner 的 system prompt 中 */
  description: string;
  /** 工具输入参数的 JSON Schema，用于告知 LLM 如何构造 input */
  schema: Record<string, unknown>;
  /**
   * 工具的执行函数
   * @param input 符合 schema 的参数对象
   * @returns 任意结构的执行结果，会序列化后反馈给 LLM
   */
  run(input: Record<string, unknown>): Promise<unknown>;
}

/**
 * 单个执行步骤记录
 * 每完成一次 plan → execute 循环后追加到 AgentState.steps 中
 *
 * @example
 * const step: AgentStep = {
 *   action: { type: 'tool', name: 'search', input: { query: 'AI Agent' } },
 *   result: { results: ['结果1', '结果2'] },
 * };
 */
export interface AgentStep {
  /** 本步骤执行的动作（工具调用或完成） */
  action: Action;
  /** 工具执行成功时的返回值，与 error 互斥 */
  result?: unknown;
  /** 工具执行失败时的错误信息，与 result 互斥 */
  error?: string;
}

/**
 * Agent 运行时状态
 * 贯穿整个 Agent 生命周期，记录用户输入、对话消息和历史执行步骤
 *
 * @example
 * const state: AgentState = {
 *   input: '上海明天天气如何？',
 *   messages: [],
 *   steps: [],
 * };
 */
export interface AgentState {
  /** 用户原始输入问题 */
  input: string;
  /** 对话消息历史（预留字段，当前由 steps 驱动消息构建） */
  messages: Array<{ role: string; content: string }>;
  /** 已执行的步骤列表，按时间顺序追加 */
  steps: AgentStep[];
}

/**
 * SSE 事件类型
 * - `thought`：Planner 决策说明
 * - `action`：即将调用的工具及其参数
 * - `result`：工具执行成功的返回值
 * - `error`：工具执行失败的错误信息
 * - `done`：任务完成，携带最终输出
 */
export type SSEEventType = 'thought' | 'action' | 'result' | 'done' | 'error';

/**
 * Agent 运行请求体
 * 客户端通过 HTTP 请求传入此结构来启动一次 Agent 任务
 *
 * @example
 * const request: AgentRunRequest = {
 *   input: '帮我搜索最新的 AI 新闻',
 *   tools: ['search'],
 * };
 */
export interface AgentRunRequest {
  /** 用户输入的任务描述 */
  input: string;
  /**
   * 指定本次任务可使用的工具名称列表（可选）
   * 若不传则使用所有已注册工具
   */
  tools?: string[];
}
