import { describe, it, expect } from 'vitest';
import { parseMcpServers } from '../mcpServers.js';

describe('config/parseMcpServers', () => {
  it('未设置或空字符串 → 返回 []', () => {
    expect(parseMcpServers(undefined)).toEqual([]);
    expect(parseMcpServers('')).toEqual([]);
    expect(parseMcpServers('   ')).toEqual([]);
  });

  it('合法 JSON 数组 → 正确解析', () => {
    const raw = JSON.stringify([
      {
        name: 'fs',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
      },
      {
        name: 'git',
        transport: 'stdio',
        command: 'uvx',
        args: ['mcp-server-git'],
        env: { GIT_AUTHOR_NAME: 'agent' },
      },
    ]);
    const result = parseMcpServers(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'fs', transport: 'stdio', command: 'npx' });
    expect(result[1]).toMatchObject({ env: { GIT_AUTHOR_NAME: 'agent' } });
  });

  it('非法 JSON → 抛错', () => {
    expect(() => parseMcpServers('not-json')).toThrow(/不是合法 JSON/);
  });

  it('非数组 JSON → 抛错', () => {
    expect(() => parseMcpServers('{"name":"x"}')).toThrow(/必须是 JSON 数组/);
  });

  it('name 重复 → 抛错', () => {
    const raw = JSON.stringify([
      { name: 'dup', transport: 'stdio', command: 'a' },
      { name: 'dup', transport: 'stdio', command: 'b' },
    ]);
    expect(() => parseMcpServers(raw)).toThrow(/重复的 name/);
  });

  it('缺少 command → 抛错', () => {
    const raw = JSON.stringify([{ name: 'x', transport: 'stdio' }]);
    expect(() => parseMcpServers(raw)).toThrow(/command 必须为非空字符串/);
  });

  it('transport 非法 → 抛错', () => {
    const raw = JSON.stringify([{ name: 'x', transport: 'ws', command: 'a' }]);
    expect(() => parseMcpServers(raw)).toThrow(/仅支持 "stdio" \| "http"/);
  });

  it('args 非字符串数组 → 抛错', () => {
    const raw = JSON.stringify([
      { name: 'x', transport: 'stdio', command: 'a', args: [1, 2] },
    ]);
    expect(() => parseMcpServers(raw)).toThrow(/args 必须是字符串数组/);
  });

  it('env 值不是字符串 → 抛错', () => {
    const raw = JSON.stringify([
      { name: 'x', transport: 'stdio', command: 'a', env: { FOO: 123 } },
    ]);
    expect(() => parseMcpServers(raw)).toThrow(/env\.FOO 必须是字符串/);
  });

  it('name 含非法字符 → 抛错', () => {
    const raw = JSON.stringify([{ name: 'my.srv', transport: 'stdio', command: 'a' }]);
    expect(() => parseMcpServers(raw)).toThrow(/只允许字母、数字、下划线与连字符/);
  });

  it('name 与内置工具同名 → 抛错', () => {
    const raw = JSON.stringify([{ name: 'search', transport: 'stdio', command: 'a' }]);
    expect(() => parseMcpServers(raw)).toThrow(/与内置工具同名/);
  });

  it('http transport 正确解析 url 与 headers', () => {
    const raw = JSON.stringify([
      {
        name: 'remote',
        transport: 'http',
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer t' },
      },
    ]);
    expect(parseMcpServers(raw)[0]).toEqual({
      name: 'remote',
      transport: 'http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer t' },
    });
  });

  it('http 缺 url 或 url 非法 → 抛错', () => {
    expect(() =>
      parseMcpServers(JSON.stringify([{ name: 'r', transport: 'http' }])),
    ).toThrow(/url 必须为非空字符串/);
    expect(() =>
      parseMcpServers(JSON.stringify([{ name: 'r', transport: 'http', url: '/relative' }])),
    ).toThrow(/不是合法绝对 URL/);
  });

  it('http headers 值非字符串 → 抛错', () => {
    const raw = JSON.stringify([
      { name: 'r', transport: 'http', url: 'https://x.com', headers: { A: 1 } },
    ]);
    expect(() => parseMcpServers(raw)).toThrow(/headers\.A 必须是字符串/);
  });

  it('allowTools / denyTools 解析与类型校验', () => {
    const ok = parseMcpServers(
      JSON.stringify([
        { name: 'fs', transport: 'stdio', command: 'a', allowTools: ['read'], denyTools: ['rm'] },
      ]),
    );
    expect(ok[0]).toMatchObject({ allowTools: ['read'], denyTools: ['rm'] });
    expect(() =>
      parseMcpServers(
        JSON.stringify([{ name: 'fs', transport: 'stdio', command: 'a', allowTools: [1] }]),
      ),
    ).toThrow(/allowTools 必须是字符串数组/);
  });
});
