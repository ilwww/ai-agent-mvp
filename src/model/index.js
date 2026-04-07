import { chat as qwenChat } from './qwen.js';

/**
 * 所有可用 Provider 注册表，预留多模型扩展入口
 * 新增模型时在此注册即可，无需修改上层代码
 */
export const providers = {
  qwen: { chat: qwenChat },
  // openai: { chat: openaiChat },  // 预留
  // claude: { chat: claudeChat },  // 预留
};

/** 默认使用的 Provider */
export const defaultProvider = providers.qwen;
