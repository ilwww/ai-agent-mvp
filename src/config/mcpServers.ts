import type {
  HttpMCPServerConfig,
  MCPServerConfig,
  StdioMCPServerConfig,
  ToolAccessConfig,
} from '../agent/mcp/types.js';

/**
 * 解析 MCP_SERVERS 环境变量。
 * 期望格式：JSON 数组，元素为
 * - stdio：`{ name, transport: 'stdio', command, args?, env? }`
 * - http： `{ name, transport: 'http', url, headers? }`
 * 空/未设置 → 返回 []；非法 JSON 或字段缺失 → 抛出错误阻塞启动。
 */
export function parseMcpServers(raw: string | undefined): MCPServerConfig[] {
  const trimmed = raw?.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(
      `[config] MCP_SERVERS 不是合法 JSON: ${(err as Error).message}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error('[config] MCP_SERVERS 必须是 JSON 数组');
  }
  const seen = new Set<string>();
  return parsed.map((item, idx) => normalizeMcpServer(item, idx, seen));
}

/** 内置工具名，server 名与之相同会导致 registry 覆盖，直接拒绝 */
const BUILTIN_TOOL_NAMES = new Set(['getWeather', 'search']);

function normalizeMcpServer(
  item: unknown,
  idx: number,
  seen: Set<string>,
): MCPServerConfig {
  if (!item || typeof item !== 'object') {
    throw new Error(`[config] MCP_SERVERS[${idx}] 必须是对象`);
  }
  const obj = item as Record<string, unknown>;
  const name = obj.name;
  const transport = obj.transport;
  if (typeof name !== 'string' || name.length === 0) {
    throw new Error(`[config] MCP_SERVERS[${idx}].name 必须为非空字符串`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(
      `[config] MCP_SERVERS[${idx}].name="${name}" 只允许字母、数字、下划线与连字符`,
    );
  }
  if (BUILTIN_TOOL_NAMES.has(name)) {
    throw new Error(
      `[config] MCP_SERVERS[${idx}].name="${name}" 与内置工具同名，请改用其他名称`,
    );
  }
  if (seen.has(name)) {
    throw new Error(`[config] MCP_SERVERS 中出现重复的 name="${name}"`);
  }
  seen.add(name);
  if (transport === 'stdio') return { ...normalizeStdio(name, obj, idx), ...parseAccess(obj, idx) };
  if (transport === 'http') return { ...normalizeHttp(name, obj, idx), ...parseAccess(obj, idx) };
  throw new Error(
    `[config] MCP_SERVERS[${idx}].transport="${String(transport)}" 仅支持 "stdio" | "http"`,
  );
}

/** 解析 allowTools / denyTools */
function parseAccess(obj: Record<string, unknown>, idx: number): ToolAccessConfig {
  const out: ToolAccessConfig = {};
  for (const key of ['allowTools', 'denyTools'] as const) {
    const val = obj[key];
    if (val === undefined) continue;
    if (!Array.isArray(val) || !val.every((v) => typeof v === 'string')) {
      throw new Error(`[config] MCP_SERVERS[${idx}].${key} 必须是字符串数组`);
    }
    out[key] = val as string[];
  }
  return out;
}

function normalizeStdio(
  name: string,
  obj: Record<string, unknown>,
  idx: number,
): StdioMCPServerConfig {
  const command = obj.command;
  if (typeof command !== 'string' || command.length === 0) {
    throw new Error(`[config] MCP_SERVERS[${idx}].command 必须为非空字符串`);
  }
  const args = obj.args;
  if (args !== undefined && (!Array.isArray(args) || !args.every((a) => typeof a === 'string'))) {
    throw new Error(`[config] MCP_SERVERS[${idx}].args 必须是字符串数组`);
  }
  const env = obj.env;
  if (env !== undefined) {
    if (!env || typeof env !== 'object' || Array.isArray(env)) {
      throw new Error(`[config] MCP_SERVERS[${idx}].env 必须是对象`);
    }
    for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
      if (typeof v !== 'string') {
        throw new Error(`[config] MCP_SERVERS[${idx}].env.${k} 必须是字符串`);
      }
    }
  }
  return {
    name,
    transport: 'stdio',
    command,
    args: args as string[] | undefined,
    env: env as Record<string, string> | undefined,
  };
}

function normalizeHttp(
  name: string,
  obj: Record<string, unknown>,
  idx: number,
): HttpMCPServerConfig {
  const url = obj.url;
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error(`[config] MCP_SERVERS[${idx}].url 必须为非空字符串`);
  }
  if (!URL.canParse(url)) {
    throw new Error(`[config] MCP_SERVERS[${idx}].url="${url}" 不是合法绝对 URL`);
  }
  const headers = obj.headers;
  if (headers !== undefined) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
      throw new Error(`[config] MCP_SERVERS[${idx}].headers 必须是对象`);
    }
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      if (typeof v !== 'string') {
        throw new Error(`[config] MCP_SERVERS[${idx}].headers.${k} 必须是字符串`);
      }
    }
  }
  return {
    name,
    transport: 'http',
    url,
    headers: headers as Record<string, string> | undefined,
  };
}
