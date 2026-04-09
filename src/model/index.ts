import { chat as qwenChat } from './qwen.js';
import { chat as deepseekChat } from './deepseek.js';
import type { Provider } from '../types.js';

type ProviderName = 'qwen' | 'deepseek';

const VALID_PROVIDERS: readonly ProviderName[] = ['qwen', 'deepseek'] as const;

/** 所有可用 Provider 注册表，新增模型在此注册即可 */
export const providers: Record<ProviderName, Provider> = {
  qwen: { chat: qwenChat },
  deepseek: { chat: deepseekChat },
};

/** 默认 Provider */
export const defaultProvider: Provider = providers.qwen;

/**
 * 按名称获取 Provider，未匹配时回退到默认
 */
export function getProvider(name?: string): Provider {
  if (name && (VALID_PROVIDERS as readonly string[]).includes(name)) {
    return providers[name as ProviderName];
  }
  return defaultProvider;
}
