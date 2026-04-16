import type { ToolAction } from './types.js';
import { getTool } from './tools/index.js';

export async function execute(action: ToolAction): Promise<unknown> {
  const tool = getTool(action.name);
  if (!tool) {
    throw new Error(`Tool not found: ${action.name}`);
  }
  return tool.run(action.input);
}
