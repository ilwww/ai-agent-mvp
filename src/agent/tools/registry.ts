import type { Tool } from '../types.js';

/**
 * 全局工具注册表
 *
 * 以工具名称（Tool.name）为键、Tool 实例为值的 Map，
 * 所有内置工具在 tools/index.ts 中通过 registerTool 注册到此表。
 */
const toolRegistry = new Map<string, Tool>();

/**
 * 注册一个工具到全局工具注册表
 *
 * 若已存在同名工具，会被新工具覆盖。
 * 通常在应用启动时（tools/index.ts）统一调用完成注册。
 *
 * @param tool 实现了 Tool 接口的工具对象
 *
 * @example
 * registerTool({
 *   name: 'calculator',
 *   description: '执行简单的数学计算',
 *   schema: {
 *     type: 'object',
 *     properties: { expression: { type: 'string' } },
 *     required: ['expression'],
 *   },
 *   async run(input) {
 *     return { result: eval(input.expression as string) };
 *   },
 * });
 */
export function registerTool(tool: Tool): void {
  toolRegistry.set(tool.name, tool);
}

/**
 * 根据工具名称从注册表中查找工具
 *
 * @param name 工具名称，对应 Tool.name
 * @returns 找到时返回 Tool 实例，未找到时返回 undefined
 *
 * @example
 * const tool = getTool('search');
 * if (tool) {
 *   const result = await tool.run({ query: 'TypeScript' });
 * }
 */
export function getTool(name: string): Tool | undefined {
  return toolRegistry.get(name);
}

/**
 * 获取注册表中所有已注册的工具列表
 *
 * @returns 包含所有已注册 Tool 实例的数组（顺序与注册顺序一致）
 *
 * @example
 * const tools = getAllTools();
 * console.log(tools.map(t => t.name));
 * // => ['getWeather', 'search']
 */
export function getAllTools(): Tool[] {
  return Array.from(toolRegistry.values());
}

/**
 * 根据工具名称列表批量获取工具
 *
 * 自动过滤掉未注册的工具名称，不会因不存在的名称而报错。
 *
 * @param names 工具名称数组
 * @returns 已注册工具的数组（顺序与 names 一致，未注册的条目被跳过）
 *
 * @example
 * // 只启用 search 工具，过滤掉未注册的 'unknown'
 * const tools = getToolsByNames(['search', 'unknown']);
 * // => [searchTool]  （'unknown' 被过滤掉）
 */
export function getToolsByNames(names: string[]): Tool[] {
  return names.map((n) => toolRegistry.get(n)).filter((t): t is Tool => t !== undefined);
}
