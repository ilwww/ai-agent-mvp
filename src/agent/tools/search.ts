/**
 * @module search
 *
 * 搜索工具（MVP 模拟实现）
 *
 * 当前阶段返回固定的模拟搜索结果，不发起真实网络请求。
 * 生产环境可将 run 方法替换为调用真实搜索 API（如 Bing Search、Serper 等）。
 */

import type { Tool } from '../types.js';

/**
 * search 工具
 *
 * 接受关键词作为输入，返回与该关键词相关的搜索结果列表。
 * 当前为 MVP 阶段的模拟实现，结果为固定占位字符串。
 *
 * @example
 * // 通过 executor 调用
 * const result = await execute({
 *   type: 'tool',
 *   name: 'search',
 *   input: { query: 'AI Agent 框架' },
 * });
 * // => {
 * //   results: [
 * //     '关于「AI Agent 框架」的搜索结果1',
 * //     '关于「AI Agent 框架」的搜索结果2',
 * //   ]
 * // }
 *
 * @example
 * // 直接调用 run 方法
 * const result = await search.run({ query: 'TypeScript 教程' });
 * // => { results: ['关于「TypeScript 教程」的搜索结果1', '关于「TypeScript 教程」的搜索结果2'] }
 */
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
    // MVP 阶段返回模拟数据，生产环境替换为真实 API 调用
    return { results: [`关于「${query}」的搜索结果1`, `关于「${query}」的搜索结果2`] };
  },
};
