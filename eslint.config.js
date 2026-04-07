import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // 未使用变量警告（下划线前缀视为有意忽略）
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 允许 console（服务端日志常用）
      'no-console': 'off',
      // 禁止 var，强制 const/let
      'no-var': 'error',
      // 优先 const
      'prefer-const': 'warn',
      // 异步函数中建议使用 await（Fastify 路由约定 async，允许 warn 级别）
      'require-await': 'off',
    },
  },
];
