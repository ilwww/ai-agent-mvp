import { describe, it, expect } from 'vitest';
import { createInitialState, updateState } from '../memory.js';
import type { AgentStep } from '../types.js';

describe('memory', () => {
  it('createInitialState 返回空 steps 与用户输入', () => {
    const state = createInitialState('hello');
    expect(state.input).toBe('hello');
    expect(state.steps).toEqual([]);
  });

  it('updateState 追加 step 且不修改原 state（不可变）', () => {
    const initial = createInitialState('q');
    const step: AgentStep = {
      action: { type: 'tool', id: 'call_1', name: 'search', input: { query: 'x' } },
      result: { ok: true },
    };
    const next = updateState(initial, step);

    expect(next).not.toBe(initial);
    expect(initial.steps).toEqual([]);
    expect(next.steps).toEqual([step]);
  });

  it('updateState 多次追加保持顺序', () => {
    let state = createInitialState('q');
    const step1: AgentStep = {
      action: { type: 'tool', id: 'c1', name: 't', input: {} },
      result: 1,
    };
    const step2: AgentStep = {
      action: { type: 'tool', id: 'c2', name: 't', input: {} },
      error: 'boom',
    };
    state = updateState(state, step1);
    state = updateState(state, step2);
    expect(state.steps).toEqual([step1, step2]);
  });
});
