import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTool } from '../../tools/registry.js';
import { MCPBridge, localToolName, toLocalTool } from '../bridge.js';
import type {
  MCPClientLike,
  MCPServerConfig,
  RemoteCallResult,
  RemoteToolDescriptor,
} from '../types.js';

/** 构造一个最小可用的 fake client */
function makeFakeClient(overrides: Partial<MCPClientLike> = {}): MCPClientLike & {
  disconnectHandlers: Array<() => void>;
  toolsChangedHandlers: Array<() => void>;
  callToolMock: ReturnType<typeof vi.fn>;
  listToolsMock: ReturnType<typeof vi.fn>;
  closed: boolean;
} {
  const disconnectHandlers: Array<() => void> = [];
  const toolsChangedHandlers: Array<() => void> = [];
  const callToolMock = vi.fn();
  const listToolsMock = vi.fn(async () => [] as RemoteToolDescriptor[]);
  const client = {
    disconnectHandlers,
    toolsChangedHandlers,
    callToolMock,
    listToolsMock,
    closed: false,
    async connect(): Promise<RemoteToolDescriptor[]> {
      return [];
    },
    callTool: callToolMock as MCPClientLike['callTool'],
    listTools: listToolsMock as MCPClientLike['listTools'],
    onDisconnect(cb: () => void): void {
      disconnectHandlers.push(cb);
    },
    onToolsChanged(cb: () => void): void {
      toolsChangedHandlers.push(cb);
    },
    async close(): Promise<void> {
      client.closed = true;
    },
    ...overrides,
  };
  return client as MCPClientLike & typeof client;
}

const cfg = (name: string): MCPServerConfig => ({
  name,
  transport: 'stdio',
  command: 'echo',
});

const remoteTool = (name: string, extra: Partial<RemoteToolDescriptor> = {}): RemoteToolDescriptor => ({
  name,
  description: `desc-${name}`,
  inputSchema: { type: 'object', properties: {} },
  ...extra,
});

/** 生成一个永不触发的 timer，避免测试异步重连噪声 */
function makeNoopTimers(): {
  setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer: (t: ReturnType<typeof setTimeout>) => void;
  scheduled: Array<{ fn: () => void; ms: number }>;
} {
  const scheduled: Array<{ fn: () => void; ms: number }> = [];
  return {
    scheduled,
    setTimer: (fn, ms) => {
      scheduled.push({ fn, ms });
      // 返回一个占位 handle；不真的挂到 event loop
      return { unref: () => undefined } as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: () => undefined,
  };
}

describe('mcp/bridge', () => {
  beforeEach(() => {
    // 避免残留：这里不能全清 registry（其他 test 依赖内置工具）
    // 每个用例用独立 server / tool 名称保证隔离
  });

  it('attach 注册工具：本地名为 `${server}__${tool}`', () => {
    const timers = makeNoopTimers();
    const client = makeFakeClient();
    const bridge = new MCPBridge({
      clientFactory: () => client,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    bridge.attach('srv-a', client, [remoteTool('echo')]);

    const tool = getTool(localToolName('srv-a', 'echo'));
    expect(tool).toBeDefined();
    expect(tool?.name).toBe('srv-a__echo');
    expect(tool?.description).toBe('desc-echo');
  });

  it('本地 Tool.run 转发参数与 signal 到 client.callTool', async () => {
    const timers = makeNoopTimers();
    const client = makeFakeClient();
    client.callToolMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
    } satisfies RemoteCallResult);
    const bridge = new MCPBridge({
      clientFactory: () => client,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    bridge.attach('srv-b', client, [remoteTool('echo')]);
    const tool = getTool(localToolName('srv-b', 'echo'))!;
    const controller = new AbortController();
    const result = await tool.run({ msg: 'hi' }, { signal: controller.signal });

    // 传入的是「上游 signal + 超时 signal」的组合信号
    const [name, args, signal] = client.callToolMock.mock.calls[0];
    expect(name).toBe('echo');
    expect(args).toEqual({ msg: 'hi' });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
  });

  it('MCP isError=true 时 run 抛错，消息来自 content 文本', async () => {
    const timers = makeNoopTimers();
    const client = makeFakeClient();
    client.callToolMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: '权限不足' }],
      isError: true,
    } satisfies RemoteCallResult);
    const bridge = new MCPBridge({
      clientFactory: () => client,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    bridge.attach('srv-c', client, [remoteTool('fail')]);
    const tool = getTool(localToolName('srv-c', 'fail'))!;

    await expect(tool.run({}, {})).rejects.toThrow('权限不足');
  });

  it('detach 后 registry 中相应 tool 被移除', () => {
    const timers = makeNoopTimers();
    const client = makeFakeClient();
    const bridge = new MCPBridge({
      clientFactory: () => client,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    bridge.attach('srv-d', client, [remoteTool('a'), remoteTool('b')]);
    expect(getTool('srv-d__a')).toBeDefined();
    expect(getTool('srv-d__b')).toBeDefined();

    bridge.detach('srv-d');
    expect(getTool('srv-d__a')).toBeUndefined();
    expect(getTool('srv-d__b')).toBeUndefined();
    expect(bridge.hasServer('srv-d')).toBe(false);
  });

  it('client 触发 disconnect 回调时，registry 中相关 tool 立刻消失', () => {
    const timers = makeNoopTimers();
    const client = makeFakeClient();
    const bridge = new MCPBridge({
      clientFactory: () => client,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    bridge.attach('srv-e', client, [remoteTool('t1')], cfg('srv-e'));
    expect(getTool('srv-e__t1')).toBeDefined();

    // 模拟 transport 断开
    for (const h of client.disconnectHandlers) h();

    expect(getTool('srv-e__t1')).toBeUndefined();
    expect(bridge.hasServer('srv-e')).toBe(false);
    // 有 config 时应排入重连队列
    expect(timers.scheduled.length).toBe(1);
    expect(timers.scheduled[0].ms).toBe(1000); // reconnectBaseMs * 2^0
  });

  it('两台 server 暴露同名远端 tool 时，`${server}__${remote}` 前缀避免冲突', () => {
    const timers = makeNoopTimers();
    const clientA = makeFakeClient();
    const clientB = makeFakeClient();
    const bridge = new MCPBridge({
      clientFactory: () => clientA, // 未走 factory 路径
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    bridge.attach('one', clientA, [remoteTool('search')]);
    bridge.attach('two', clientB, [remoteTool('search')]);

    expect(getTool('one__search')).toBeDefined();
    expect(getTool('two__search')).toBeDefined();
    expect(getTool('one__search')).not.toBe(getTool('two__search'));
  });

  it('connectServer 成功时把 tools 挂到 registry；close 后被清理', async () => {
    const timers = makeNoopTimers();
    const client = makeFakeClient({
      async connect() {
        return [remoteTool('ping')];
      },
    });
    const bridge = new MCPBridge({
      clientFactory: () => client,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    await bridge.connectServer(cfg('srv-f'));
    expect(getTool('srv-f__ping')).toBeDefined();

    await bridge.close();
    expect(getTool('srv-f__ping')).toBeUndefined();
  });

  it('toLocalTool 独立可用：即使不通过 bridge 也返回可 run 的 Tool', async () => {
    const client = makeFakeClient();
    client.callToolMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'unit' }],
    });
    const tool = toLocalTool('svr', remoteTool('t'), client);
    const r = await tool.run({ x: 1 });
    expect(r).toEqual({ content: [{ type: 'text', text: 'unit' }] });
    const [name, args, signal] = client.callToolMock.mock.calls[0];
    expect(name).toBe('t');
    expect(args).toEqual({ x: 1 });
    // 无上游 signal 时仍带超时 signal
    expect(signal).toBeInstanceOf(AbortSignal);
  });

  it('调用超时时抛出带 server/tool 名的超时错误', async () => {
    const client = makeFakeClient();
    // 永不 resolve，直到传入的 signal 被 abort
    client.callToolMock.mockImplementation(
      (_n: string, _a: unknown, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const tool = toLocalTool('srv-t', remoteTool('slow'), client, {
      callTimeoutMs: 5,
      resultMaxChars: 100,
    });

    await expect(tool.run({})).rejects.toThrow(
      /MCP tool srv-t\/slow timed out after 5ms/,
    );
  });

  it('上游取消时抛出的不是超时错误', async () => {
    const client = makeFakeClient();
    client.callToolMock.mockImplementation(
      (_n: string, _a: unknown, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new Error('client cancelled')));
        }),
    );
    const tool = toLocalTool('srv-t2', remoteTool('slow'), client, {
      callTimeoutMs: 60_000,
      resultMaxChars: 100,
    });
    const controller = new AbortController();
    const promise = tool.run({}, { signal: controller.signal });
    controller.abort();

    await expect(promise).rejects.toThrow('client cancelled');
  });

  it('超长 text 结果被截断，非 text 内容降级为占位描述', async () => {
    const client = makeFakeClient();
    client.callToolMock.mockResolvedValueOnce({
      content: [
        { type: 'text', text: 'x'.repeat(30) },
        { type: 'image', data: 'AAAA', mimeType: 'image/png' },
      ],
    });
    const tool = toLocalTool('srv-n', remoteTool('big'), client, {
      callTimeoutMs: 1000,
      resultMaxChars: 10,
    });

    const r = (await tool.run({})) as { content: Array<{ type: string; text?: string }> };
    expect(r.content[0].text).toBe(`${'x'.repeat(10)}…[truncated 20 chars]`);
    expect(r.content[1]).toEqual({ type: 'text', text: '[image content omitted]' });
  });

  it('isError 的错误消息同样受 resultMaxChars 约束', async () => {
    const client = makeFakeClient();
    client.callToolMock.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'e'.repeat(50) }],
      isError: true,
    });
    const tool = toLocalTool('srv-e2', remoteTool('fail'), client, {
      callTimeoutMs: 1000,
      resultMaxChars: 5,
    });

    await expect(tool.run({})).rejects.toThrow(/^eeeee…\[truncated 45 chars\]$/);
  });

  it('localToolName 规范化非法字符并对超长名截断保唯一', () => {
    expect(localToolName('srv', 'files/read.text')).toBe('srv__files_read_text');

    const longA = localToolName('srv', `${'a'.repeat(80)}1`);
    const longB = localToolName('srv', `${'a'.repeat(80)}2`);
    expect(longA.length).toBe(64);
    expect(longB.length).toBe(64);
    expect(longA).not.toBe(longB);
    expect(longA).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('tools/list_changed 通知后按新列表刷新 registry', async () => {
    const timers = makeNoopTimers();
    const client = makeFakeClient();
    client.listToolsMock.mockResolvedValue([remoteTool('kept'), remoteTool('added')]);
    const bridge = new MCPBridge({
      clientFactory: () => client,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    bridge.attach('srv-g', client, [remoteTool('kept'), remoteTool('removed')], cfg('srv-g'));
    expect(getTool('srv-g__removed')).toBeDefined();

    for (const h of client.toolsChangedHandlers) h();
    await vi.waitFor(() => expect(getTool('srv-g__added')).toBeDefined());

    expect(getTool('srv-g__kept')).toBeDefined();
    expect(getTool('srv-g__removed')).toBeUndefined();
    // 刷新不应重复登记通知回调
    expect(client.toolsChangedHandlers.length).toBe(1);
  });

  it('allowTools 只注册命中项，denyTools 优先于 allowTools', () => {
    const timers = makeNoopTimers();
    const client = makeFakeClient();
    const bridge = new MCPBridge({
      clientFactory: () => client,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    bridge.attach('srv-h', client, [remoteTool('read'), remoteTool('write')], {
      ...cfg('srv-h'),
      allowTools: ['read'],
    });
    expect(getTool('srv-h__read')).toBeDefined();
    expect(getTool('srv-h__write')).toBeUndefined();

    bridge.attach('srv-i', client, [remoteTool('read'), remoteTool('write')], {
      ...cfg('srv-i'),
      allowTools: ['read', 'write'],
      denyTools: ['write'],
    });
    expect(getTool('srv-i__read')).toBeDefined();
    expect(getTool('srv-i__write')).toBeUndefined();
  });

  it('getStatus 反映连接态、工具清单与重连次数', async () => {
    const timers = makeNoopTimers();
    const client = makeFakeClient({
      async connect() {
        return [remoteTool('ok')];
      },
    });
    const bridge = new MCPBridge({
      clientFactory: () => client,
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });

    await bridge.connectServer(cfg('srv-j'));
    expect(bridge.getStatus()).toEqual([
      {
        name: 'srv-j',
        transport: 'stdio',
        connected: true,
        tools: ['srv-j__ok'],
        reconnectAttempts: 0,
      },
    ]);

    for (const h of client.disconnectHandlers) h();
    const afterDisconnect = bridge.getStatus()[0];
    expect(afterDisconnect.connected).toBe(false);
    expect(afterDisconnect.tools).toEqual([]);
  });
});
