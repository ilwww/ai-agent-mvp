import type { ToolAction } from './types.js';
import { getTool } from './tools/index.js';

/**
 * 执行一个工具调用动作
 *
 * 根据 action.name 从工具注册表中查找对应工具，
 * 并将 action.input 作为参数传入工具的 run 方法执行。
 *
 * @param action 包含工具名称和输入参数的 ToolAction 对象
 * @returns 工具执行后的返回值（结构由各工具自定义）
 * @throws {Error} 当 action.name 在注册表中不存在时抛出 "Tool not found: {name}"
 *
 * @example
 * // 调用搜索工具
 * const result = await execute({
 *   type: 'tool',
 *   name: 'search',
 *   input: { query: 'TypeScript 最佳实践' },
 * });
 * // => { results: ['关于「TypeScript 最佳实践」的搜索结果1', '...'] }
 *
 * @example
 * // 调用天气工具
 * const result = await execute({
 *   type: 'tool',
 *   name: 'getWeather',
 *   input: { city: '北京' },
 * });
 * // => { city: '北京', temperature: 28, weather: '晴', ... }
 */
export async function execute(action: ToolAction): Promise<unknown> {
  const tool = getTool(action.name);
  if (!tool) {
    throw new Error(`Tool not found: ${action.name}`);
  }
  return tool.run(action.input);
}
