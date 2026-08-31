import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BaseMCPClient } from './client.js';
import type { HttpMCPServerConfig } from './types.js';

/**
 * streamable HTTP transport 客户端。
 *
 * `headers` 用于携带鉴权信息（如 `Authorization`），透传给 fetch。
 */
export class MCPHttpClient extends BaseMCPClient {
  constructor(cfg: HttpMCPServerConfig) {
    super(
      () =>
        new StreamableHTTPClientTransport(new URL(cfg.url), {
          requestInit: cfg.headers ? { headers: cfg.headers } : undefined,
        }),
    );
  }
}
