import type { ChatCompletion } from 'openai/resources/chat/completions.js';
import { getProvider } from '../model/index.js';
import type { Action, AgentState, Tool } from './types.js';

/**
 * 根据可用工具列表构建 system prompt
 *
 * 将所有工具的名称、描述和 JSON Schema 拼接成自然语言说明，
 * 注入到 system prompt 中，指导 LLM 以固定 JSON 格式输出决策。
 *
 * @param tools 当前任务可使用的工具列表
 * @returns 完整的 system prompt 字符串
 *
 * @example
 * const prompt = buildSystemPrompt([searchTool, weatherTool]);
 * // 输出包含工具描述的 system prompt，要求 LLM 以如下格式响应：
 * // {"type":"tool","name":"工具名","input":{...}} 或
 * // {"type":"finish","output":"最终回答内容"}
 */
function buildSystemPrompt(tools: Tool[]): string {
  const toolDescriptions = tools
    .map((t) => `- ${t.name}: ${t.description}, 参数 schema: ${JSON.stringify(t.schema)}`)
    .join('\n');

  return `你是一个 AI Agent，你需要根据用户的任务一步步思考并选择合适的工具来完成任务。

可用工具：
${toolDescriptions}

请严格按照以下 JSON 格式输出你的决策（不要输出其他内容）：

如果需要调用工具：
{"type":"tool","name":"工具名","input":{...参数}}

如果任务已完成，直接输出最终回答：
{"type":"finish","output":"最终回答内容"}`;
}

/**
 * 将当前 AgentState 转换为 LLM 可接受的对话消息数组
 *
 * 构建规则：
 * 1. 首条为 system 消息（包含工具描述和输出格式约束）
 * 2. 第二条为 user 消息（用户原始输入）
 * 3. 对于 state.steps 中每个 tool 类型的步骤，追加两条消息：
 *    - assistant 消息：上一步 Planner 输出的工具调用 JSON
 *    - user 消息：工具执行的返回结果或错误信息
 *
 * @param state       当前 Agent 状态（含历史执行步骤）
 * @param systemPrompt 由 buildSystemPrompt 生成的系统提示词
 * @returns 格式化的对话消息数组，可直接传入 LLM provider
 *
 * @example
 * const messages = buildMessages(state, systemPrompt);
 * // [
 * //   { role: 'system', content: '你是一个 AI Agent...' },
 * //   { role: 'user', content: '北京今天天气？' },
 * //   { role: 'assistant', content: '{"type":"tool","name":"getWeather","input":{"city":"北京"}}' },
 * //   { role: 'user', content: '工具 getWeather 返回结果：{"city":"北京","temperature":28,...}' },
 * // ]
 */
function buildMessages(
  state: AgentState,
  systemPrompt: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: state.input },
  ];

  // 追加历史步骤：将每一步的工具调用与结果还原为对话上下文
  for (const step of state.steps) {
    if (step.action.type === 'tool') {
      messages.push({
        role: 'assistant',
        content: JSON.stringify(step.action),
      });
      messages.push({
        role: 'user',
        content: `工具 ${step.action.name} 返回结果：${JSON.stringify(step.result ?? step.error)}`,
      });
    }
  }

  return messages;
}

/**
 * 调用 LLM 对当前状态进行规划，返回下一步动作决策
 *
 * 流程：
 * 1. 构建包含工具描述的 system prompt
 * 2. 将状态历史转换为对话消息
 * 3. 调用 qwen provider 获取 LLM 响应
 * 4. 从响应中提取 JSON 并解析为 Action
 * 5. 若解析失败或格式不合法，降级返回 FinishAction（将原始内容作为输出）
 *
 * @param state 当前 Agent 状态（含用户输入和历史步骤）
 * @param tools 本次任务可使用的工具列表
 * @returns 解析后的 Action（ToolAction 或 FinishAction）
 *
 * @example
 * const state = createInitialState('上海明天天气如何？');
 * const tools = [getWeather];
 * const action = await plan(state, tools);
 *
 * // LLM 决定调用天气工具时：
 * // => { type: 'tool', name: 'getWeather', input: { city: '上海' } }
 *
 * // LLM 判断任务已完成时：
 * // => { type: 'finish', output: '上海明天多云，气温 22°C。' }
 */
export async function plan(state: AgentState, tools: Tool[]): Promise<Action> {
  const systemPrompt = buildSystemPrompt(tools);
  const messages = buildMessages(state, systemPrompt);

  const provider = getProvider('qwen');
  const resp = (await provider.chat({ messages, stream: false })) as ChatCompletion;
  const content = resp.choices[0].message.content ?? '';

  // 从 LLM 响应中提取 JSON 块（兼容响应中夹杂自然语言的情况）
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // LLM 未输出任何 JSON，直接将原始内容作为最终回答
    return { type: 'finish', output: content };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Action;
    if (parsed.type === 'tool' && 'name' in parsed) return parsed;
    if (parsed.type === 'finish' && 'output' in parsed) return parsed;
    // JSON 结构不符合预期，降级处理
    return { type: 'finish', output: content };
  } catch {
    // JSON.parse 失败，降级处理
    return { type: 'finish', output: content };
  }
}
