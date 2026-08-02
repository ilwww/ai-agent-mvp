import { describe, it, expect } from 'vitest';
import { execute } from '../executor.js';
import { registerTool } from '../tools/registry.js';
import type { Tool, ToolAction } from '../types.js';

describe('executor', () => {
  it('工具存在时正常执行并返回结果', async () => {
    const tool: Tool = {
      name: 'exec-ok',
      description: 'ok',
      schema: {},
      async run(input) {
        return { echoed: input };
      },
    };
    registerTool(tool);
    const action: ToolAction = { type: 'tool', id: 'c1', name: 'exec-ok', input: { a: 1 } };
    const res = await execute(action);
    expect(res).toEqual({ echoed: { a: 1 } });
  });

  it('工具不存在时抛 Tool not found', async () => {
    const action: ToolAction = { type: 'tool', id: 'c2', name: 'not-registered', input: {} };
    await expect(execute(action)).rejects.toThrow(/Tool not found: not-registered/);
  });

  it('工具内部抛错时透传', async () => {
    const tool: Tool = {
      name: 'exec-throw',
      description: 'throw',
      schema: {},
      async run() {
        throw new Error('boom');
      },
    };
    registerTool(tool);
    const action: ToolAction = { type: 'tool', id: 'c3', name: 'exec-throw', input: {} };
    await expect(execute(action)).rejects.toThrow('boom');
  });

  it('signal 通过 ctx 透传给工具', async () => {
    let capturedSignal: AbortSignal | undefined;
    const tool: Tool = {
      name: 'exec-signal',
      description: 'signal',
      schema: {},
      async run(_input, ctx) {
        capturedSignal = ctx?.signal;
        return 'ok';
      },
    };
    registerTool(tool);
    const controller = new AbortController();
    const action: ToolAction = { type: 'tool', id: 'c4', name: 'exec-signal', input: {} };
    await execute(action, controller.signal);
    expect(capturedSignal).toBe(controller.signal);
  });
});
