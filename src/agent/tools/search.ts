import type { Tool } from '../types.js';

export const search: Tool = {
  name: 'search',
  description: '搜索指定关键词的信息',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: '搜索关键词' },
    },
    required: ['query'],
  },
  async run(input) {
    const query = input.query as string;
    // MVP 阶段返回模拟数据
    return { results: [`关于「${query}」的搜索结果1`, `关于「${query}」的搜索结果2`] };
  },
};
