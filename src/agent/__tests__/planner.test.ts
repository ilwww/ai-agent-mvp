import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatCompletion } from 'openai/resources/chat/completions.js';
import type { Tool } from '../types.js';
import { createInitialState } from '../memory.js';

// Mock provider 模块：plan() 中 getProvider('qwen').chat(...) 会走这里
const chatMock = vi.fn();
vi.mock('../../model/index.js', () => ({
  getProvider: () => ({ chat: chatMock }),
  // 保持其他导出兼容
  providers: {},
  defaultProvider: { chat: chatMock },
}));

// 必须在 vi.mock 之后导入
const { plan } = await import('../planner.js');

/** 构造一个最小可用的 ChatCompletion 响应（仅包含 planner 依赖字段） */
function makeCompletion(msg: {
  content?: string | null;
  tool_calls?: Array<{ id: string; name: string; args: string }>;
}): ChatCompletion {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: msg.content ?? null,
          refusal: null,
          tool_calls: msg.tool_calls?.map((c) => ({
            id: c.id,
            type: 'function',
            function: { name: c.name, arguments: c.args },
          })),
        },
        index: 0,
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
  } as unknown as ChatCompletion;
}

const dummyTool: Tool = {
  name: 'getWeather',
  description: 'weather',
  schema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
  async run() {
    return {};
  },
};

describe('planner', () => {
  beforeEach(() => {
    chatMock.mockReset();
  });

  it('LLM 返回 tool_calls 时映射为 ToolAction[]', async () => {
    chatMock.mockResolvedValueOnce(
      makeCompletion({
        tool_calls: [{ id: 'call_abc', name: 'getWeather', args: '{"city":"北京"}' }],
      }),
    );
    const state = createInitialState('北京天气');
    const actions = await plan(state, [dummyTool]);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({
      type: 'tool',
      id: 'call_abc',
      name: 'getWeather',
      input: { city: '北京' },
    });
  });

  it('LLM 返回多条 tool_calls 时并列映射', async () => {
    chatMock.mockResolvedValueOnce(
      makeCompletion({
        tool_calls: [
          { id: 'c1', name: 'getWeather', args: '{"city":"北京"}' },
          { id: 'c2', name: 'getWeather', args: '{"city":"上海"}' },
        ],
      }),
    );
    const actions = await plan(createInitialState('q'), [dummyTool]);
    expect(actions.map((a) => a.type)).toEqual(['tool', 'tool']);
    expect(actions).toHaveLength(2);
  });

  it('LLM 无 tool_calls 时返回 FinishAction', async () => {
    chatMock.mockResolvedValueOnce(makeCompletion({ content: '最终答案' }));
    const actions = await plan(createInitialState('q'), [dummyTool]);
    expect(actions).toEqual([{ type: 'finish', output: '最终答案' }]);
  });

  it('LLM content 为 null 时 FinishAction 输出空字符串', async () => {
    chatMock.mockResolvedValueOnce(makeCompletion({ content: null }));
    const actions = await plan(createInitialState('q'), [dummyTool]);
    expect(actions).toEqual([{ type: 'finish', output: '' }]);
  });

  it('arguments 是非法 JSON 时 input 携带 __argsError（tool 端可作为错误反馈）', async () => {
    chatMock.mockResolvedValueOnce(
      makeCompletion({
        tool_calls: [{ id: 'bad', name: 'getWeather', args: 'not-a-json' }],
      }),
    );
    const actions = await plan(createInitialState('q'), [dummyTool]);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('tool');
    if (actions[0].type === 'tool') {
      expect(actions[0].input).toHaveProperty('__argsError');
    }
  });

  it('signal 与 tools 参数被传递给 provider.chat', async () => {
    chatMock.mockResolvedValueOnce(makeCompletion({ content: 'ok' }));
    const controller = new AbortController();
    await plan(createInitialState('q'), [dummyTool], controller.signal);
    expect(chatMock).toHaveBeenCalledOnce();
    const arg = chatMock.mock.calls[0][0] as {
      signal?: AbortSignal;
      tools?: unknown[];
      tool_choice?: string;
    };
    expect(arg.signal).toBe(controller.signal);
    expect(arg.tools).toHaveLength(1);
    expect(arg.tool_choice).toBe('auto');
  });

  it('historyTurns 会被展开为 user / assistant.tool_calls / tool / assistant.content 序列', async () => {
    chatMock.mockResolvedValueOnce(makeCompletion({ content: 'ok' }));
    const historyTurns = [
      {
        userInput: '北京天气',
        steps: [
          {
            action: {
              type: 'tool' as const,
              id: 'call_1',
              name: 'getWeather',
              input: { city: '北京' },
            },
            result: { temperature: 28 },
          },
        ],
        finalOutput: '北京 28°C 晴',
      },
    ];
    await plan(createInitialState('那上海呢'), [dummyTool], undefined, historyTurns);

    const arg = chatMock.mock.calls[0][0] as {
      messages: Array<Record<string, unknown>>;
    };
    // system, user(北京天气), assistant.tool_calls, tool, assistant.content, user(那上海呢)
    expect(arg.messages).toHaveLength(6);
    expect(arg.messages[0].role).toBe('system');
    expect(arg.messages[1]).toMatchObject({ role: 'user', content: '北京天气' });
    expect(arg.messages[2]).toMatchObject({ role: 'assistant' });
    expect((arg.messages[2].tool_calls as unknown[])[0]).toMatchObject({
      id: 'call_1',
      function: { name: 'getWeather' },
    });
    expect(arg.messages[3]).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
    expect(arg.messages[4]).toMatchObject({ role: 'assistant', content: '北京 28°C 晴' });
    expect(arg.messages[5]).toMatchObject({ role: 'user', content: '那上海呢' });
  });

  it('historyTurns 为空时消息序列为 system + 当前 user', async () => {
    chatMock.mockResolvedValueOnce(makeCompletion({ content: 'ok' }));
    await plan(createInitialState('北京天气'), [dummyTool]);
    const arg = chatMock.mock.calls[0][0] as { messages: Array<Record<string, unknown>> };
    expect(arg.messages).toHaveLength(2);
    expect(arg.messages[0].role).toBe('system');
    expect(arg.messages[1]).toMatchObject({ role: 'user', content: '北京天气' });
  });
});
