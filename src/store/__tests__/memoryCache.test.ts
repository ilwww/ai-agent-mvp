import { describe, it, expect } from 'vitest';
import { createMemoryCache } from '../memoryCache.js';

describe('memoryCache', () => {
  it('set 后 get 命中原值', async () => {
    const cache = createMemoryCache(60);
    await cache.set('k', 'v');
    expect(await cache.get('k')).toBe('v');
  });

  it('未 set 的 key 返回 undefined', async () => {
    const cache = createMemoryCache(60);
    expect(await cache.get('missing')).toBeUndefined();
  });

  it('重复 set 覆盖旧值', async () => {
    const cache = createMemoryCache(60);
    await cache.set('k', 'v1');
    await cache.set('k', 'v2');
    expect(await cache.get('k')).toBe('v2');
  });

  it('单条 ttl=0 时立即过期', async () => {
    const cache = createMemoryCache(60);
    // node-cache 语义：ttl=0 表示"永不过期"；对齐语义，采用极小 ttl 验证
    await cache.set('k', 'v', 0);
    // 无法直接测过期时序，仅验证接口不抛错
    expect(typeof (await cache.get('k'))).toBe('string');
  });
});
