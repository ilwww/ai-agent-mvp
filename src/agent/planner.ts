import type { ChatCompletion } from 'openai/resources/chat/completions.js';
import { getProvider } from '../model/index.js';
import type { Action, AgentState, Tool } from './types.js';

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

function buildMessages(
  state: AgentState,
  systemPrompt: string,
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: state.input },
  ];

  // 追加历史步骤
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

export async function plan(state: AgentState, tools: Tool[]): Promise<Action> {
  const systemPrompt = buildSystemPrompt(tools);
  const messages = buildMessages(state, systemPrompt);

  const provider = getProvider('qwen');
  const resp = (await provider.chat({ messages, stream: false })) as ChatCompletion;
  const content = resp.choices[0].message.content ?? '';

  // 从 LLM 响应中提取 JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { type: 'finish', output: content };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Action;
    if (parsed.type === 'tool' && 'name' in parsed) return parsed;
    if (parsed.type === 'finish' && 'output' in parsed) return parsed;
    return { type: 'finish', output: content };
  } catch {
    return { type: 'finish', output: content };
  }
}
