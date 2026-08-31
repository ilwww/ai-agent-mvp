import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  MCPClientLike,
  RemoteCallResult,
  RemoteToolDescriptor,
  StdioMCPServerConfig,
} from './types.js';

/** 构造 transport 的工厂函数；测试可注入 fake */
export type TransportFactory = (cfg: StdioMCPServerConfig) => Transport;

/** 默认 transport 工厂：spawn 子进程走 stdio */
export const defaultStdioTransportFactory: TransportFactory = (cfg) =>
  new StdioClientTransport({
    command: cfg.command,
    args: cfg.args,
    env: cfg.env,
    // 子进程 stderr 交由调用方转发到日志，便于排查启动失败
    stderr: 'pipe',
  });

/**
 * 单台 MCP 服务器的连接封装（与 transport 无关的公共部分）。
 * 只暴露 bridge / index 所需的最小 API。
 */
export class BaseMCPClient implements MCPClientLike {
  protected readonly client: Client;
  protected transport?: Transport;
  private readonly disconnectHandlers: Array<() => void> = [];
  private readonly toolsChangedHandlers: Array<() => void> = [];
  private closed = false;

  constructor(private readonly makeTransport: () => Transport) {
    this.client = new Client(
      { name: 'ai-agent-mvp', version: '2.0.0' },
      { capabilities: {} },
    );
    this.client.setNotificationHandler(ToolListChangedNotificationSchema, () => {
      for (const h of this.toolsChangedHandlers) h();
    });
  }

  async connect(): Promise<RemoteToolDescriptor[]> {
    const transport = this.makeTransport();
    // 挂在 client.connect 之前，避免早期错误漏事件
    const originalOnClose = transport.onclose;
    transport.onclose = () => {
      originalOnClose?.();
      if (this.closed) return;
      for (const h of this.disconnectHandlers) h();
    };
    this.transport = transport;
    await this.client.connect(transport);
    this.afterConnect(transport);
    return this.listTools();
  }

  /** 子类钩子：连接建立后处理 transport 特有逻辑（如 stderr 转发） */
  protected afterConnect(_transport: Transport): void {}

  /** 拉取当前工具列表，供首次连接与 list_changed 刷新复用 */
  async listTools(): Promise<RemoteToolDescriptor[]> {
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteCallResult> {
    const res = await this.client.callTool(
      { name, arguments: args },
      undefined,
      { signal },
    );
    // SDK 返回联合类型：兼容 { content, isError } 与老的 { toolResult } 两种。
    // 本项目按新版契约处理；老版走兜底转换。
    if ('content' in res && Array.isArray((res as { content: unknown }).content)) {
      return {
        content: (res as { content: RemoteCallResult['content'] }).content,
        isError: (res as { isError?: boolean }).isError,
      };
    }
    return {
      content: [{ type: 'text', text: JSON.stringify((res as { toolResult: unknown }).toolResult) }],
    };
  }

  onDisconnect(cb: () => void): void {
    this.disconnectHandlers.push(cb);
  }

  onToolsChanged(cb: () => void): void {
    this.toolsChangedHandlers.push(cb);
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.client.close();
    } finally {
      this.transport = undefined;
    }
  }
}

/** stdio transport 客户端：子进程 stderr 转发到 logger */
export class MCPStdioClient extends BaseMCPClient {
  constructor(
    private readonly cfg: StdioMCPServerConfig,
    transportFactory: TransportFactory = defaultStdioTransportFactory,
    private readonly onStderr?: (line: string) => void,
  ) {
    super(() => transportFactory(cfg));
  }

  protected override afterConnect(transport: Transport): void {
    if (!this.onStderr) return;
    const stderr = (transport as StdioClientTransport).stderr;
    stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trimEnd();
      if (text) this.onStderr!(`[${this.cfg.name}] ${text}`);
    });
  }
}
