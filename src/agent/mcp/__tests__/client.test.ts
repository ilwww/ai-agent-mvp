import { describe, it, expect } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { BaseMCPClient } from '../client.js';

/**
 * 用 SDK 的 InMemoryTransport 起一台真实 MCP server，
 * 覆盖 BaseMCPClient（stdio / http 客户端共用）的 connect / listTools / callTool / close。
 */
async function makeLinkedClient(): Promise<{ client: BaseMCPClient; server: Server }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = new Server(
    { name: 'fake', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'echo',
        description: 'echo back',
        inputSchema: { type: 'object', properties: { msg: { type: 'string' } } },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== 'echo') {
      throw new Error(`unknown tool ${req.params.name}`);
    }
    const msg = (req.params.arguments as { msg?: string } | undefined)?.msg ?? '';
    return { content: [{ type: 'text', text: `echo:${msg}` }] };
  });
  await server.connect(serverTransport);
  const client = new BaseMCPClient(() => clientTransport);
  return { client, server };
}

describe('mcp/BaseMCPClient', () => {
  it('connect 返回工具描述列表', async () => {
    const { client } = await makeLinkedClient();
    const tools = await client.connect();
    expect(tools.map((t) => t.name)).toContain('echo');
    expect(tools[0].inputSchema).toBeTypeOf('object');
    await client.close();
  });

  it('callTool 返回 content 数组', async () => {
    const { client } = await makeLinkedClient();
    await client.connect();
    const res = await client.callTool('echo', { msg: 'hi' });
    expect(res.content[0]).toMatchObject({ type: 'text', text: 'echo:hi' });
    await client.close();
  });

  it('调用不存在的工具时抛错', async () => {
    const { client } = await makeLinkedClient();
    await client.connect();
    await expect(client.callTool('nope', {})).rejects.toThrow();
    await client.close();
  });

  it('close 幂等，且关闭后不再触发 disconnect 回调', async () => {
    const { client } = await makeLinkedClient();
    await client.connect();
    let disconnected = 0;
    client.onDisconnect(() => {
      disconnected += 1;
    });
    await client.close();
    await client.close();
    expect(disconnected).toBe(0);
  });
});
