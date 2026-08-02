import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    // 单测应快且无外部依赖，禁用长超时
    testTimeout: 5000,
  },
});
