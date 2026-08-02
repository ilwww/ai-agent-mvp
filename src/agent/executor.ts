import type { ToolAction } from './types.js';
import { getTool } from './tools/index.js';

/**
 * 执行一个工具调用动作
 *
 * 根据 action.name 从工具注册表中查找对应工具，
 * 并将 action.input 作为参数传入工具的 run 方法执行。
 * `signal` 用于把上游 AbortController 透传给工具内部的 fetch 等长任务。
 *
 * @param action 包含工具名称和输入参数的 ToolAction 对象
 * @param signal 可选 AbortSignal，用于取消工具内部的异步 I/O
 * @returns 工具执行后的返回值（结构由各工具自定义）
 * @throws {Error} 当 action.name 在注册表中不存在时抛出 "Tool not found: {name}"
 */
export async function execute(action: ToolAction, signal?: AbortSignal): Promise<unknown> {
  const tool = getTool(action.name);
  if (!tool) {
    throw new Error(`Tool not found: ${action.name}`);
  }
  return tool.run(action.input, { signal });
}
