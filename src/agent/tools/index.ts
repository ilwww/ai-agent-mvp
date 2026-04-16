import { registerTool } from './registry.js';
import { getWeather } from './weather.js';
import { search } from './search.js';

// 注册所有内置工具
registerTool(getWeather);
registerTool(search);

// 重新导出 registry API
export { getTool, getAllTools, getToolsByNames, registerTool } from './registry.js';
