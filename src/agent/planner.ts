import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
} from 'openai/resources/chat/completions.js';
import { getProvider } from '../model/index.js';
import type { Action, AgentState, Tool, ToolAction } from './types.js';
import type { SessionTurn } from '../store/types.js';

/**
 * 生成简化后的 system prompt。
 *
 * 由于工具调用改由 OpenAI 原生 function-calling 承载（`tools` + `tool_choice`），
 * system prompt 不再需要描述工具或约束输出 JSON 格式，只保留任务导向说明。
 */
function buildSystemPrompt(): string {
  return (
    `你是一个 AI Agent。根据用户任务与已有工具执行结果，选择合适的工具继续推进任务；` +
    `当信息已足以回答时，直接给出最终答案，不要再调用工具。`
  );
}

/**
 * 将 Agent 内部 Tool 定义映射为 OpenAI function-calling 规范
 */
function buildOpenAITools(tools: Tool[]): ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parameters: t.schema as any,
    },
  }));
}

/**
 * 把 AgentState.steps（当前回合）展开为 OpenAI 规范消息。
 */
function pushStepMessages(messages: ChatCompletionMessageParam[], steps: AgentState['steps']): void {
  for (const step of steps) {
    if (step.action.type !== 'tool') continue;
    const { id, name, input } = step.action;
    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id,
          type: 'function',
          function: { name, arguments: JSON.stringify(input) },
        },
      ],
    });
    const payload = step.error !== undefined ? { error: step.error } : (step.result ?? null);
    messages.push({
      role: 'tool',
      tool_call_id: id,
      content: JSON.stringify(payload),
    });
  }
}

/**
 * 按顺序把历史 turn 展开为多轮对话消息序列。
 *
 * 每个 turn 展开为：
 *   user: turn.userInput
 *   [assistant.tool_calls, tool] × N
 *   assistant.content: turn.finalOutput
 */
function pushHistoryTurns(
  messages: ChatCompletionMessageParam[],
  historyTurns: SessionTurn[],
): void {
  for (const turn of historyTurns) {
    messages.push({ role: 'user', content: turn.userInput });
    pushStepMessages(messages, turn.steps);
    messages.push({ role: 'assistant', content: turn.finalOutput });
  }
}

/**
 * 组装完整消息数组：system → 历史 turns → 当前 user → 当前 steps。
 */
function buildMessages(
  state: AgentState,
  systemPrompt: string,
  historyTurns: SessionTurn[],
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }];
  pushHistoryTurns(messages, historyTurns);
  messages.push({ role: 'user', content: state.input });
  pushStepMessages(messages, state.steps);
  return messages;
}

/**
 * 将 LLM 返回的 tool_calls 映射为内部 ToolAction 列表。
 * 单条 arguments 解析失败时降级为 `input: {}` 并附带 `__argsError`，
 * 让 executor 侧记录成 tool error step，允许 LLM 下一步纠正。
 */
function mapToolCalls(toolCalls: ChatCompletionMessageToolCall[]): ToolAction[] {
  return toolCalls.map((call) => {
    let input: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(call.function.arguments || '{}');
      if (parsed && typeof parsed === 'object') {
        input = parsed as Record<string, unknown>;
      }
    } catch {
      input = { __argsError: `arguments 非法 JSON: ${call.function.arguments}` };
    }
    return {
      type: 'tool',
      id: call.id,
      name: call.function.name,
      input,
    };
  });
}

/**
 * 调用 LLM 对当前状态进行规划，返回下一步动作列表。
 *
 * 使用 OpenAI 原生 function-calling：
 * - 若 LLM 返回 `tool_calls`（可能多条），映射为 ToolAction[] 供 runtime 并发执行
 * - 若无 tool_calls，将 `content` 作为最终回答返回 FinishAction
 *
 * @param state        当前 Agent 状态（当前回合）
 * @param tools        本次任务可用工具
 * @param signal       可选 AbortSignal
 * @param historyTurns 跨请求会话的历史 turn 列表，默认为空
 */
export async function plan(
  state: AgentState,
  tools: Tool[],
  signal?: AbortSignal,
  historyTurns: SessionTurn[] = [],
): Promise<Action[]> {
  const systemPrompt = buildSystemPrompt();
  const messages = buildMessages(state, systemPrompt, historyTurns);
  const oaiTools = buildOpenAITools(tools);

  const provider = getProvider('qwen');
  const resp = (await provider.chat({
    messages,
    stream: false,
    tools: oaiTools,
    tool_choice: 'auto',
    signal,
  })) as ChatCompletion;

  const msg = resp.choices[0].message;
  const toolCalls = msg.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    return mapToolCalls(toolCalls);
  }

  return [{ type: 'finish', output: msg.content ?? '' }];
}
