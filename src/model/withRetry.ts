import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
  RateLimitError,
} from 'openai';

/**
 * withRetry 选项。
 * - maxRetries：额外重试次数（不含首次调用），0 表示不重试。
 * - baseDelayMs：指数退避基数，`delay = base * 2^attempt + jitter(0..base)`。
 * - signal：可选 AbortSignal，等待中收到 abort 会立即抛 AbortError，且不再发起后续重试。
 * - onRetry：可选回调，便于日志与测试断言。
 */
export interface WithRetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  signal?: AbortSignal;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
}

/**
 * 判断错误是否为幂等的可重试错误。
 * 仅对以下情况返回 true：
 * - RateLimitError（HTTP 429）
 * - APIConnectionError / APIConnectionTimeoutError（连接失败 / 超时）
 * - 其他 APIError 且 5xx
 *
 * 明确不重试：
 * - APIUserAbortError：用户主动取消
 * - 其他 4xx（含 400/401/403/404）
 * - 非 OpenAI APIError 类型的运行时错误
 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof APIUserAbortError) return false;
  if (err instanceof RateLimitError) return true;
  if (err instanceof APIConnectionTimeoutError) return true;
  if (err instanceof APIConnectionError) return true;
  if (err instanceof APIError) {
    const status = err.status ?? 0;
    return status >= 500 && status < 600;
  }
  return false;
}

/**
 * 幂等请求重试包装：指数退避 + 抖动，尊重 AbortSignal。
 *
 * 使用场景：仅适合"整体幂等"的调用（如尚未返回流的 chat completion 首次请求）。
 * 一旦上游 Promise resolve（例如已经拿到 Stream 对象），本函数即结束职责。
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: WithRetryOptions): Promise<T> {
  const { maxRetries, baseDelayMs, signal, onRetry } = opts;
  let attempt = 0;
  for (;;) {
    if (signal?.aborted) throw newAbortError();
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableError(err) || attempt >= maxRetries) throw err;
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * baseDelayMs);
      onRetry?.(err, attempt + 1, delay);
      await sleep(delay, signal);
      attempt += 1;
    }
  }
}

/**
 * 支持 AbortSignal 中断的 sleep。
 * 被 abort 时清理 timer 并抛出 AbortError（与 fetch/OpenAI SDK 语义一致）。
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(newAbortError());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(newAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function newAbortError(): Error {
  const err = new Error('withRetry aborted');
  err.name = 'AbortError';
  return err;
}
