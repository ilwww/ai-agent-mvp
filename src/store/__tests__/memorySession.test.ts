import { describe, it, expect } from 'vitest';
import { createMemorySession, truncateTurns } from '../memorySession.js';
import type { AgentStep } from '../../agent/types.js';
import type { SessionTurn } from '../types.js';

function makeStep(id: string): AgentStep {
  return {
    action: { type: 'tool', id, name: 'getWeather', input: { city: id } },
    result: { ok: id },
  };
}

function makeTurn(userInput: string, stepIds: string[] = [], finalOutput = 'ok'): SessionTurn {
  return {
    userInput,
    steps: stepIds.map(makeStep),
    finalOutput,
  };
}

describe('memorySession', () => {
  it('save 后 get 返回相同 sessionId 数据', async () => {
    const store = createMemorySession(60, 20);
    await store.save({
      sessionId: 's1',
      turns: [makeTurn('北京天气', ['bj']), makeTurn('上海呢', ['sh'])],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const got = await store.get('s1');
    expect(got?.sessionId).toBe('s1');
    expect(got?.turns).toHaveLength(2);
    expect(got?.turns[0].userInput).toBe('北京天气');
    expect(got?.turns[1].userInput).toBe('上海呢');
  });

  it('未 save 的 sessionId 返回 undefined', async () => {
    const store = createMemorySession(60, 20);
    expect(await store.get('nope')).toBeUndefined();
  });

  it('TTL 过期后 get 返回 undefined 并清理条目', async () => {
    let fakeNow = 1_000_000;
    const now = (): number => fakeNow;
    const store = createMemorySession(1, 20, now);
    await store.save({
      sessionId: 's2',
      turns: [makeTurn('q1')],
      createdAt: fakeNow,
      updatedAt: fakeNow,
    });
    fakeNow += 2000;
    expect(await store.get('s2')).toBeUndefined();
  });

  it('save 时按 maxTurns 截断，保留最新', async () => {
    const store = createMemorySession(60, 3);
    const turns = ['a', 'b', 'c', 'd', 'e'].map((k) => makeTurn(k));
    await store.save({
      sessionId: 's3',
      turns,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const got = await store.get('s3');
    expect(got?.turns).toHaveLength(3);
    expect(got?.turns.map((t) => t.userInput)).toEqual(['c', 'd', 'e']);
  });

  it('delete 幂等', async () => {
    const store = createMemorySession(60, 20);
    await store.save({
      sessionId: 's4',
      turns: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await store.delete('s4');
    await store.delete('s4');
    expect(await store.get('s4')).toBeUndefined();
  });

  it('save 会刷新 updatedAt', async () => {
    let fakeNow = 1_000_000;
    const store = createMemorySession(60, 20, () => fakeNow);
    await store.save({
      sessionId: 's5',
      turns: [],
      createdAt: fakeNow,
      updatedAt: fakeNow,
    });
    fakeNow += 500;
    await store.save({
      sessionId: 's5',
      turns: [makeTurn('新回合')],
      createdAt: 1_000_000,
      updatedAt: 0, // 应被覆盖
    });
    const got = await store.get('s5');
    expect(got?.updatedAt).toBe(fakeNow);
  });
});

describe('truncateTurns', () => {
  it('长度 <= max 时原样返回', () => {
    const turns = [makeTurn('a'), makeTurn('b')];
    expect(truncateTurns(turns, 5)).toBe(turns);
  });

  it('长度 > max 时保留末尾', () => {
    const turns = ['a', 'b', 'c', 'd'].map((k) => makeTurn(k));
    const truncated = truncateTurns(turns, 2);
    expect(truncated.map((t) => t.userInput)).toEqual(['c', 'd']);
  });
});
