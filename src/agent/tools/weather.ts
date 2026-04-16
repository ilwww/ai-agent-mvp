import type { Tool } from '../types.js';

export const getWeather: Tool = {
  name: 'getWeather',
  description: '获取指定城市的天气信息',
  schema: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称' },
    },
    required: ['city'],
  },
  async run(input) {
    const city = input.city as string;
    // MVP 阶段返回模拟数据
    const mockData: Record<string, { temp: number; weather: string }> = {
      北京: { temp: 25, weather: '晴' },
      上海: { temp: 22, weather: '多云' },
      广州: { temp: 30, weather: '阵雨' },
    };
    return mockData[city] ?? { temp: 20, weather: '未知' };
  },
};
