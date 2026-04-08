import { chat as qwenChat } from './qwen.js';
import { chat as deepseekChat } from './deepseek.js';

/**
 * 所有可用 Provider 注册表，新增模型在此注册即可
 */
export const providers = {
  qwen: { chat: qwenChat },
  deepseek: { chat: deepseekChat },
  // claude: { chat: claudeChat },  // 预留
};

/** 默认 Provider */
export const defaultProvider = providers.qwen;

/**
 * 按名称获取 Provider，未匹配时回退到默认
 * @param {string} [name]
 */
export function getProvider(name) {
  return providers[name] ?? defaultProvider;
}
