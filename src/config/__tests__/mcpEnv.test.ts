import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * 校验 config/index.ts 中 MCP 运行参数的默认值与非法值处理。
 * config 模块在导入时求值，故每个用例都重置模块缓存后重新导入。
 */
const ENV_KEYS = ['DASHSCOPE_API_KEY', 'MCP_CALL_TIMEOUT_MS', 'MCP_RESULT_MAX_CHARS'] as const;

let saved: Record<string, string | undefined>;

async function loadConfig() {
  vi.resetModules();
  const mod = await import('../index.js');
  return mod.config as { mcpCallTimeoutMs: number; mcpResultMaxChars: number };
}

describe('config MCP 运行参数', () => {
  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.DASHSCOPE_API_KEY = 'test-key';
    delete process.env.MCP_CALL_TIMEOUT_MS;
    delete process.env.MCP_RESULT_MAX_CHARS;
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('未设置时使用默认值', async () => {
    const config = await loadConfig();
    expect(config.mcpCallTimeoutMs).toBe(30000);
    expect(config.mcpResultMaxChars).toBe(8000);
  });

  it('合法值被采纳', async () => {
    process.env.MCP_CALL_TIMEOUT_MS = '5000';
    process.env.MCP_RESULT_MAX_CHARS = '100';
    const config = await loadConfig();
    expect(config.mcpCallTimeoutMs).toBe(5000);
    expect(config.mcpResultMaxChars).toBe(100);
  });

  it('非整数 → 抛错', async () => {
    process.env.MCP_CALL_TIMEOUT_MS = 'abc';
    await expect(loadConfig()).rejects.toThrow(/不是合法整数/);
  });

  it('非正数 → 抛错', async () => {
    process.env.MCP_RESULT_MAX_CHARS = '0';
    await expect(loadConfig()).rejects.toThrow(/必须为正整数/);
  });
});
