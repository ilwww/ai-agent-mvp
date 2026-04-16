import type { AgentState, AgentStep } from './types.js';

export function createInitialState(input: string): AgentState {
  return {
    input,
    messages: [],
    steps: [],
  };
}

export function updateState(state: AgentState, step: AgentStep): AgentState {
  return {
    ...state,
    steps: [...state.steps, step],
  };
}
