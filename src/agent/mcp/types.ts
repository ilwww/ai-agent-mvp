/**
 * MCP（Model Context Protocol）相关类型定义。
 *
 * 仅覆盖本项目实际用到的字段，避免直接依赖 SDK 类型污染业务层。
 */

/** 工具准入配置：deny 优先于 allow；均缺省时全部放行 */
export interface ToolAccessConfig {
  /** 白名单：仅注册命中的远端工具名 */
  allowTools?: string[];
  /** 黑名单：命中的远端工具名不注册 */
  denyTools?: string[];
}

/** stdio transport 服务器配置 */
export interface StdioMCPServerConfig extends ToolAccessConfig {
  /** 唯一名称，用作 tool 前缀：`${name}__${remoteTool}` */
  name: string;
  transport: 'stdio';
  /** 可执行文件（如 `npx` / `node`） */
  command: string;
  /** 命令行参数 */
  args?: string[];
  /** 追加到子进程的环境变量 */
  env?: Record<string, string>;
}

/** streamable HTTP transport 服务器配置 */
export interface HttpMCPServerConfig extends ToolAccessConfig {
  /** 唯一名称，用作 tool 前缀：`${name}__${remoteTool}` */
  name: string;
  transport: 'http';
  /** MCP endpoint 绝对 URL */
  url: string;
  /** 附加请求头，用于鉴权（如 Authorization） */
  headers?: Record<string, string>;
}

/** 已支持的 MCP 服务器配置 */
export type MCPServerConfig = StdioMCPServerConfig | HttpMCPServerConfig;

/** MCP 侧描述的工具（仅保留本项目关心的字段） */
export interface RemoteToolDescriptor {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** MCP callTool 返回的最小结构 */
export interface RemoteCallResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

/**
 * MCPClient 面向 bridge 的接口，方便测试注入 mock。
 * 实际 SDK 客户端封装类会实现此接口。
 */
export interface MCPClientLike {
  /** 建立连接并返回工具描述列表 */
  connect(): Promise<RemoteToolDescriptor[]>;
  /** 调用远端 tool */
  callTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<RemoteCallResult>;
  /** 登记断连回调；同一 client 允许多次登记 */
  onDisconnect(cb: () => void): void;
  /** 登记 `tools/list_changed` 通知回调 */
  onToolsChanged?(cb: () => void): void;
  /** 重新拉取工具列表（用于 list_changed 刷新） */
  listTools?(): Promise<RemoteToolDescriptor[]>;
  /** 关闭连接（幂等） */
  close(): Promise<void>;
}

/** 单个已注册工具与其来源 server 的绑定关系 */
export interface RemoteToolBinding {
  server: string;
  remoteName: string;
  localName: string;
}
