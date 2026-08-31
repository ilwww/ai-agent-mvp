import type { Tool } from '../types.js';
import { registerTool, unregisterTool } from '../tools/registry.js';
import { sanitizeSchema } from './schema.js';
import type {
  MCPClientLike,
  MCPServerConfig,
  RemoteCallResult,
  RemoteToolBinding,
  RemoteToolDescriptor,
} from './types.js';

/** logger 最小接口，避免直接依赖 Fastify 日志类型 */
export interface BridgeLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/** 由 bridge 创建 MCPClient 的工厂；测试可注入 fake */
export type ClientFactory = (cfg: MCPServerConfig) => MCPClientLike;

export interface BridgeOptions {
  /** 断连后首次重连的退避基数（毫秒），默认 1000 */
  reconnectBaseMs?: number;
  /** 单次重连退避的最大值（毫秒），默认 30_000 */
  reconnectMaxMs?: number;
  logger?: BridgeLogger;
  clientFactory?: ClientFactory;
  /** 计时器工厂，测试可注入 fake（默认 setTimeout） */
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (t: ReturnType<typeof setTimeout>) => void;
  /** 单次工具调用与结果大小的限制 */
  limits?: Partial<ToolLimits>;
  /** 连续重连失败达到该次数后升级为 error 日志，默认 5 */
  reconnectAlertThreshold?: number;
}

/** 单台 MCP server 的运行状态快照 */
export interface MCPServerStatus {
  name: string;
  transport: MCPServerConfig['transport'];
  connected: boolean;
  /** 已注册到 registry 的本地工具名 */
  tools: string[];
  /** 当前连续重连失败次数；0 表示无失败 */
  reconnectAttempts: number;
}

/** 单次工具调用的运行时约束 */
export interface ToolLimits {
  /** 单次 callTool 超时（毫秒） */
  callTimeoutMs: number;
  /** 结果文本最大字符数，超出截断 */
  resultMaxChars: number;
}

export const DEFAULT_TOOL_LIMITS: ToolLimits = {
  callTimeoutMs: 30_000,
  resultMaxChars: 8000,
};

const noopLogger: BridgeLogger = {
  info() {},
  warn() {},
  error() {},
};

/** 截断超长文本，附带省略提示，避免灌满模型上下文 */
function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const omitted = text.length - maxChars;
  return `${text.slice(0, maxChars)}…[truncated ${omitted} chars]`;
}

/**
 * 把 MCP `content` 数组降级为字符串，用于把 tool error message 冒出去。
 * 只提取 text 类型；其他类型退化为 JSON。
 */
function contentToText(
  content: RemoteCallResult['content'],
  maxChars: number = DEFAULT_TOOL_LIMITS.resultMaxChars,
): string {
  if (!content || content.length === 0) return '';
  const parts = content.map((c) => {
    if (c.type === 'text' && typeof c.text === 'string') return c.text;
    return JSON.stringify(c);
  });
  return truncate(parts.join('\n'), maxChars);
}

/**
 * 规整远端返回的 content：
 * - text 类型按累计字符数截断，超出预算后不再追加
 * - 非 text 类型（image / audio / resource 等）降级为占位描述，避免 base64 打爆 token
 */
export function normalizeResultContent(
  content: RemoteCallResult['content'],
  maxChars: number,
): RemoteCallResult['content'] {
  if (!content || content.length === 0) return [];
  let budget = maxChars;
  const out: RemoteCallResult['content'] = [];
  for (const item of content) {
    if (item.type !== 'text' || typeof item.text !== 'string') {
      out.push({ type: 'text', text: `[${item.type} content omitted]` });
      continue;
    }
    if (budget <= 0) continue;
    out.push({ type: 'text', text: truncate(item.text, budget) });
    budget -= item.text.length;
  }
  return out;
}

/** OpenAI function 名长度上限 */
const MAX_TOOL_NAME_LENGTH = 64;

/** 生成 6 位稳定 hash（FNV-1a），用于超长名截断后保唯一 */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, '0').slice(-6);
}

/**
 * 生成本地工具名：`${server}__${remoteName}`（双下划线兼容 OpenAI function 名规则）。
 *
 * MCP 允许 `.` `/` 等字符且不限长度，而 OpenAI 侧要求 `^[a-zA-Z0-9_-]{1,64}$`，
 * 因此非法字符替换为 `_`，超长则截断并追加短 hash 保证唯一。
 */
export function localToolName(server: string, remoteName: string): string {
  const raw = `${server}__${remoteName}`;
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (safe.length <= MAX_TOOL_NAME_LENGTH) return safe;
  const suffix = `_${shortHash(raw)}`;
  return safe.slice(0, MAX_TOOL_NAME_LENGTH - suffix.length) + suffix;
}

/**
 * 把单个远端工具描述映射为本项目 Tool。
 * `run` 内部调用 `client.callTool`，把 `isError: true` 转为抛错，
 * 让 executor 走 error step 让 planner 感知。
 *
 * 调用受 `limits.callTimeoutMs` 约束：超时会抛错而不是挂住整个 ReAct 循环。
 */
export function toLocalTool(
  server: string,
  remote: RemoteToolDescriptor,
  client: MCPClientLike,
  limits: ToolLimits = DEFAULT_TOOL_LIMITS,
  logger: BridgeLogger = noopLogger,
): Tool {
  return {
    name: localToolName(server, remote.name),
    description: remote.description ?? `MCP tool ${server}/${remote.name}`,
    schema: sanitizeSchema(remote.inputSchema),
    async run(input, ctx) {
      const timeoutSignal = AbortSignal.timeout(limits.callTimeoutMs);
      const signal = ctx?.signal
        ? AbortSignal.any([ctx.signal, timeoutSignal])
        : timeoutSignal;
      const startedAt = performance.now();
      const durationMs = () => Math.round(performance.now() - startedAt);
      let res: RemoteCallResult;
      try {
        res = await client.callTool(remote.name, input, signal);
      } catch (err) {
        // 超时与上游取消需区分：超时是 MCP server 的问题，应让 planner 知情
        if (timeoutSignal.aborted) {
          logger.warn(
            { server, tool: remote.name, durationMs: durationMs(), outcome: 'timeout' },
            `MCP tool timed out: ${server}/${remote.name}`,
          );
          throw new Error(
            `MCP tool ${server}/${remote.name} timed out after ${limits.callTimeoutMs}ms`,
          );
        }
        logger.warn(
          {
            server,
            tool: remote.name,
            durationMs: durationMs(),
            outcome: 'error',
            err: (err as Error).message,
          },
          `MCP tool call failed: ${server}/${remote.name}`,
        );
        throw err;
      }
      if (res.isError) {
        const message =
          contentToText(res.content, limits.resultMaxChars) ||
          `MCP tool ${remote.name} failed`;
        logger.warn(
          { server, tool: remote.name, durationMs: durationMs(), outcome: 'tool_error' },
          `MCP tool returned error: ${server}/${remote.name}`,
        );
        throw new Error(message);
      }
      logger.info(
        { server, tool: remote.name, durationMs: durationMs(), outcome: 'ok' },
        `MCP tool ok: ${server}/${remote.name}`,
      );
      return { content: normalizeResultContent(res.content, limits.resultMaxChars) };
    },
  };
}

/**
 * 判断远端工具是否被 allow/deny 配置放行；deny 优先于 allow。
 * 两者都未配置时全部放行，保持向后兼容。
 */
export function isToolAllowed(remoteName: string, cfg?: MCPServerConfig): boolean {
  if (cfg?.denyTools?.includes(remoteName)) return false;
  if (cfg?.allowTools && !cfg.allowTools.includes(remoteName)) return false;
  return true;
}

/**
 * MCP 桥接器：管理每台 server 的工具注册、断连清理与重连。
 */
export class MCPBridge {
  private readonly bindings = new Map<string, RemoteToolBinding[]>();
  private readonly clients = new Map<string, MCPClientLike>();
  private readonly configs = new Map<string, MCPServerConfig>();
  private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly toolsChangedHooked = new WeakSet<MCPClientLike>();
  private readonly reconnectAttempts = new Map<string, number>();
  private stopped = false;

  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly logger: BridgeLogger;
  private readonly clientFactory: ClientFactory;
  private readonly setTimer: NonNullable<BridgeOptions['setTimer']>;
  private readonly clearTimer: NonNullable<BridgeOptions['clearTimer']>;
  private readonly limits: ToolLimits;
  private readonly reconnectAlertThreshold: number;

  constructor(opts: BridgeOptions = {}) {
    this.reconnectBaseMs = opts.reconnectBaseMs ?? 1000;
    this.reconnectMaxMs = opts.reconnectMaxMs ?? 30_000;
    this.logger = opts.logger ?? noopLogger;
    if (!opts.clientFactory) {
      throw new Error('MCPBridge requires a clientFactory');
    }
    this.clientFactory = opts.clientFactory;
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((t) => clearTimeout(t));
    this.limits = { ...DEFAULT_TOOL_LIMITS, ...opts.limits };
    this.reconnectAlertThreshold = opts.reconnectAlertThreshold ?? 5;
  }

  /**
   * 把已连接的 client 与其暴露的 tools 注册到 registry。
   * 同名（同 server 内）远端 tool 会覆盖旧绑定。
   */
  attach(
    server: string,
    client: MCPClientLike,
    tools: RemoteToolDescriptor[],
    cfg?: MCPServerConfig,
  ): RemoteToolBinding[] {
    // 若同 server 之前已 attach，先摘除避免残留
    if (this.bindings.has(server)) {
      this.detach(server);
    }
    this.clients.set(server, client);
    if (cfg) this.configs.set(server, cfg);
    const effectiveCfg = cfg ?? this.configs.get(server);
    const allowed = tools.filter((t) => isToolAllowed(t.name, effectiveCfg));
    const skipped = tools.length - allowed.length;
    if (skipped > 0) {
      this.logger.info(
        { server, skipped },
        `MCP tools filtered by allow/deny list: ${server} (${skipped} skipped)`,
      );
    }
    const bindings: RemoteToolBinding[] = allowed.map((remote) => {
      const localName = localToolName(server, remote.name);
      registerTool(toLocalTool(server, remote, client, this.limits, this.logger));
      return { server, remoteName: remote.name, localName };
    });
    this.bindings.set(server, bindings);
    // 断连时清理 + 触发重连
    client.onDisconnect(() => this.handleDisconnect(server));
    // 远端工具列表变化时刷新；按 client 去重，避免每次 refresh 重复登记
    if (client.onToolsChanged && client.listTools && !this.toolsChangedHooked.has(client)) {
      this.toolsChangedHooked.add(client);
      client.onToolsChanged(() => void this.refreshTools(server));
    }
    return bindings;
  }

  /** 收到 `tools/list_changed` 后重新拉取并重挂工具 */
  private async refreshTools(server: string): Promise<void> {
    if (this.stopped) return;
    const client = this.clients.get(server);
    if (!client?.listTools) return;
    try {
      const tools = await client.listTools();
      this.attach(server, client, tools, this.configs.get(server));
      this.logger.info(
        { server, count: tools.length },
        `MCP tools refreshed: ${server} (${tools.length} tools)`,
      );
    } catch (err) {
      this.logger.warn(
        { server, err: (err as Error).message },
        `MCP tools refresh failed: ${server}`,
      );
    }
  }

  /** 摘除某台 server 的所有工具，但保留 config 供重连 */
  detach(server: string): void {
    const bindings = this.bindings.get(server);
    if (!bindings) return;
    for (const b of bindings) unregisterTool(b.localName);
    this.bindings.delete(server);
    this.clients.delete(server);
  }

  /**
   * 由外部（index.ts）在启动阶段调用一次；后续断连由 bridge 内部触发。
   * connectAll 失败的 server 也会走 scheduleReconnect。
   */
  async connectServer(cfg: MCPServerConfig): Promise<void> {
    this.configs.set(cfg.name, cfg);
    try {
      const client = this.clientFactory(cfg);
      const tools = await client.connect();
      this.attach(cfg.name, client, tools, cfg);
      this.reconnectAttempts.delete(cfg.name);
      this.logger.info(
        { server: cfg.name, count: tools.length },
        `MCP connected: ${cfg.name} (${tools.length} tools)`,
      );
    } catch (err) {
      this.logger.error(
        { server: cfg.name, err: (err as Error).message },
        `MCP initial connect failed: ${cfg.name}`,
      );
      this.scheduleReconnect(cfg, 0);
    }
  }

  /** 关闭所有 client 与重连计时器，之后不再重连 */
  async close(): Promise<void> {
    this.stopped = true;
    for (const t of this.pendingTimers) this.clearTimer(t);
    this.pendingTimers.clear();
    const closes: Array<Promise<void>> = [];
    for (const [server, client] of this.clients) {
      this.detach(server);
      closes.push(client.close().catch(() => undefined));
    }
    await Promise.all(closes);
    this.configs.clear();
  }

  /** 便于测试断言 */
  hasServer(server: string): boolean {
    return this.bindings.has(server);
  }

  /**
   * 当前各 MCP server 的连接状态，用于 `/mcp/servers` 与排障。
   * 覆盖已配置但尚未连上的 server（connected: false）。
   */
  getStatus(): MCPServerStatus[] {
    return Array.from(this.configs.keys()).map((name) => ({
      name,
      transport: this.configs.get(name)!.transport,
      connected: this.bindings.has(name),
      tools: (this.bindings.get(name) ?? []).map((b) => b.localName),
      reconnectAttempts: this.reconnectAttempts.get(name) ?? 0,
    }));
  }

  private handleDisconnect(server: string): void {
    if (this.stopped) return;
    const cfg = this.configs.get(server);
    this.logger.warn({ server }, `MCP disconnected: ${server}`);
    this.detach(server);
    if (cfg) this.scheduleReconnect(cfg, 0);
  }

  private scheduleReconnect(cfg: MCPServerConfig, attempt: number): void {
    if (this.stopped) return;
    const delay = Math.min(this.reconnectBaseMs * 2 ** attempt, this.reconnectMaxMs);
    const timer = this.setTimer(() => {
      this.pendingTimers.delete(timer);
      void this.tryReconnect(cfg, attempt);
    }, delay);
    this.pendingTimers.add(timer);
  }

  private async tryReconnect(cfg: MCPServerConfig, attempt: number): Promise<void> {
    if (this.stopped) return;
    try {
      const client = this.clientFactory(cfg);
      const tools = await client.connect();
      this.attach(cfg.name, client, tools, cfg);
      this.reconnectAttempts.delete(cfg.name);
      this.logger.info(
        { server: cfg.name, count: tools.length },
        `MCP reconnected: ${cfg.name}`,
      );
    } catch (err) {
      const attempts = attempt + 1;
      this.reconnectAttempts.set(cfg.name, attempts);
      const payload = { server: cfg.name, err: (err as Error).message, attempt: attempts };
      // 连续失败超过阈值时升级为 error，便于告警
      if (attempts >= this.reconnectAlertThreshold) {
        this.logger.error(
          payload,
          `MCP reconnect failing repeatedly: ${cfg.name} (${attempts} attempts)`,
        );
      } else {
        this.logger.warn(payload, `MCP reconnect failed: ${cfg.name}`);
      }
      this.scheduleReconnect(cfg, attempts);
    }
  }
}
