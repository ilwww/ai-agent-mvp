export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // 仅保留表达变更性质的 type；历史中的 `prev` 不纳入
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    // 中文描述不适用英文大小写与句号规则
    'subject-case': [0],
    'subject-full-stop': [0],
    // 允许中文 scope（历史上有 feat(基础建设)）
    'scope-case': [0],
    'header-max-length': [2, 'always', 100],
  },
};
