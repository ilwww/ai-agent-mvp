import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  languageOptions: {
    ecmaVersion: 2022,
    globals: {
      ...globals.node,
    },
  },
  rules: {
    // 关闭 JS 版本，由 TS 版本接管
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // 允许 console（服务端日志常用）
    'no-console': 'off',
    // 禁止 var，强制 const/let
    'no-var': 'error',
    // 优先 const
    'prefer-const': 'warn',
    'require-await': 'off',
    // @ts-expect-error 注释允许（用于 DashScope 非标准字段）
    '@typescript-eslint/ban-ts-comment': [
      'error',
      { 'ts-expect-error': 'allow-with-description' },
    ],
  },
});
