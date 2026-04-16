import type { Tool } from '../types.js';

const toolRegistry = new Map<string, Tool>();

export function registerTool(tool: Tool): void {
  toolRegistry.set(tool.name, tool);
}

export function getTool(name: string): Tool | undefined {
  return toolRegistry.get(name);
}

export function getAllTools(): Tool[] {
  return Array.from(toolRegistry.values());
}

export function getToolsByNames(names: string[]): Tool[] {
  return names.map((n) => toolRegistry.get(n)).filter((t): t is Tool => t !== undefined);
}
