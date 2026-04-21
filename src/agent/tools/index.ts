/**
 * @module tools/index
 *
 * 工具注册入口
 *
 * 负责两件事：
 * 1. 将所有内置工具（getWeather、search）注册到全局工具注册表
 * 2. 统一重新导出 registry 的 API，外部模块只需从此文件导入，
 *    无需直接依赖 registry.ts
 *
 * @example
 * // 在 runtime.ts 中获取所有工具
 * import { getAllTools } from './tools/index.js';
 * const tools = getAllTools(); // [getWeather, search]
 *
 * @example
 * // 按名称筛选工具
 * import { getToolsByNames } from './tools/index.js';
 * const tools = getToolsByNames(['search']); // 只启用搜索工具
 */

import { registerTool } from './registry.js';
import { getWeather } from './weather.js';
import { search } from './search.js';

// 注册所有内置工具
registerTool(getWeather);
registerTool(search);

// 重新导出 registry API
export { getTool, getAllTools, getToolsByNames, registerTool } from './registry.js';
