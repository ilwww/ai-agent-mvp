import {
  MCPBridge,
  type BridgeLogger,
  type ClientFactory,
  type MCPServerStatus,
  type ToolLimits,
} from './bridge.js';
import { MCPStdioClient } from './client.js';
import { MCPHttpClient } from './httpClient.js';
import type { MCPServerConfig } from './types.js';

/** 默认 client 工厂：按 transport 分派 */
function makeDefaultClientFactory(logger: BridgeLogger): ClientFactory {
  return (cfg) => {
    if (cfg.transport === 'http') return new MCPHttpClient(cfg);
    return new MCPStdioClient(cfg, undefined, (line) =>
      logger.warn({ server: cfg.name }, `MCP stderr ${line}`),
    );
  };
}

let bridge: MCPBridge | undefined;

/**
 * 启动阶段并发连接所有 MCP 服务器。
 *
 * - 使用 `Promise.allSettled`：单台失败不阻塞其他 server 与主服务启动。
 * - 首次连接失败的 server 会被排入内部重连队列。
 * - 幂等：重复调用会先关闭旧 bridge。
 */
export async function connectAllMcpServers(
  configs: MCPServerConfig[],
  logger: BridgeLogger,
  opts: { clientFactory?: ClientFactory; limits?: Partial<ToolLimits> } = {},
): Promise<void> {
  if (bridge) {
    await bridge.close();
  }
  bridge = new MCPBridge({
    logger,
    clientFactory: opts.clientFactory ?? makeDefaultClientFactory(logger),
    limits: opts.limits,
  });
  if (configs.length === 0) return;
  await Promise.allSettled(configs.map((cfg) => bridge!.connectServer(cfg)));
}

/** 关闭所有 MCP 连接（应用退出时调用） */
export async function closeAllMcpServers(): Promise<void> {
  if (!bridge) return;
  await bridge.close();
  bridge = undefined;
}

/** 当前 MCP server 连接状态；未初始化时返回空数组 */
export function getMcpStatus(): MCPServerStatus[] {
  return bridge?.getStatus() ?? [];
}

/** 测试辅助：暴露内部 bridge 实例 */
export function _getMcpBridgeForTest(): MCPBridge | undefined {
  return bridge;
}
