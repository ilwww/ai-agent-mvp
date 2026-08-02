import { describe, it, expect, beforeEach } from 'vitest';
import type { Tool } from '../../types.js';

// 直接从 registry 导入，避免 tools/index.ts 副作用（会注册内置工具）
import { registerTool, getTool, getAllTools, getToolsByNames } from '../registry.js';

// 内部注册表是模块级 Map；测试之间需清理，用一个覆盖名 + 断言存在即可
function makeTool(name: string): Tool {
  return {
    name,
    description: `desc-${name}`,
    schema: { type: 'object', properties: {} },
    async run() {
      return { ok: name };
    },
  };
}

describe('tools/registry', () => {
  const registeredNames: string[] = [];
  beforeEach(() => {
    // 每个用例用独立名称，避免相互污染
    registeredNames.length = 0;
  });

  it('registerTool 后可通过 getTool 查询', () => {
    const t = makeTool('reg-a');
    registerTool(t);
    registeredNames.push('reg-a');
    expect(getTool('reg-a')).toBe(t);
  });

  it('getTool 对未注册名称返回 undefined', () => {
    expect(getTool('never-registered-xyz')).toBeUndefined();
  });

  it('getAllTools 包含已注册的工具', () => {
    const t = makeTool('reg-b');
    registerTool(t);
    const names = getAllTools().map((x) => x.name);
    expect(names).toContain('reg-b');
  });

  it('getToolsByNames 过滤未注册项', () => {
    registerTool(makeTool('reg-c'));
    const tools = getToolsByNames(['reg-c', 'not-exist']);
    expect(tools.map((t) => t.name)).toEqual(['reg-c']);
  });

  it('同名重复 registerTool 会覆盖旧值', () => {
    const a = makeTool('dup');
    const b = { ...makeTool('dup'), description: 'new' };
    registerTool(a);
    registerTool(b);
    expect(getTool('dup')).toBe(b);
  });
});
