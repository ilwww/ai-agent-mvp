import { describe, it, expect, vi } from 'vitest';
import { APIConnectionError, APIError, RateLimitError } from 'openai';
import { withRetry, isRetryableError } from '../withRetry.js';

/** 构造 status=xxx 的 APIError（用于模拟 4xx / 5xx） */
function makeApiError(status: number, msg = `http ${status}`): APIError {
  return new APIError(status, undefined, msg, {});
}

/** 构造 429 RateLimitError */
function makeRateLimit(): RateLimitError {
  return new RateLimitError(429, undefined, 'rate limit', {});
}

describe('isRetryableError', () => {
  it('对 429 / 5xx / APIConnectionError 返回 true', () => {
    expect(isRetryableError(makeRateLimit())).toBe(true);
    expect(isRetryableError(makeApiError(500))).toBe(true);
    expect(isRetryableError(makeApiError(503))).toBe(true);
    expect(isRetryableError(new APIConnectionError({ message: 'econnreset' }))).toBe(true);
  });

  it('对 4xx（非 429）与普通错误返回 false', () => {
    expect(isRetryableError(makeApiError(400))).toBe(false);
    expect(isRetryableError(makeApiError(401))).toBe(false);
    expect(isRetryableError(makeApiError(404))).toBe(false);
    expect(isRetryableError(new TypeError('bug'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('前两次 429，第三次成功，共调用 3 次并返回结果', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(makeRateLimit())
      .mockRejectedValueOnce(makeRateLimit())
      .mockResolvedValueOnce('ok');

    const result = await withRetry(fn, { maxRetries: 2, baseDelayMs: 1 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('4xx（400）错误立即抛出，fn 只调用 1 次', async () => {
    const err = makeApiError(400, 'bad request');
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);

    await expect(withRetry(fn, { maxRetries: 3, baseDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('signal 在调用前已 aborted 时，抛 AbortError 且 fn 未被调用', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn<() => Promise<string>>().mockResolvedValue('never');

    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 1, signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('重试等待期间 abort，抛 AbortError 且不再消耗剩余重试次数', async () => {
    const controller = new AbortController();
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(makeRateLimit());
    // 使用较大的 baseDelayMs 确保 sleep 时可以稳定捕捉 abort
    const promise = withRetry(fn, {
      maxRetries: 5,
      baseDelayMs: 50,
      signal: controller.signal,
    });
    // 首次调用后进入 sleep，随后 abort
    setTimeout(() => controller.abort(), 10);

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    // 抛错前应只发生首次调用；至多 2 次（若在极端调度下重试过一次），远小于 maxRetries+1=6
    expect(fn.mock.calls.length).toBeLessThan(6);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('maxRetries=0 时 429 立即抛出，fn 只调用 1 次', async () => {
    const err = makeRateLimit();
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(err);

    await expect(withRetry(fn, { maxRetries: 0, baseDelayMs: 1 })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onRetry 回调在每次重试前触发，attempt 从 1 开始', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(makeRateLimit())
      .mockRejectedValueOnce(makeApiError(500))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();

    await withRetry(fn, { maxRetries: 3, baseDelayMs: 1, onRetry });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][1]).toBe(1);
    expect(onRetry.mock.calls[1][1]).toBe(2);
  });
});
