#!/usr/bin/env node
/**
 * 从 git 历史重建 CHANGELOG.md。
 *
 * 设计取舍：不依赖 conventional-changelog 工具链（其 CLI 5 与 conventionalcommits
 * preset 的 writer 版本不兼容，且默认隐藏 chore/docs 等 type，与「每次 commit 都有记录」
 * 的目标冲突）。这里直接解析 `git log`，全部 type 一律收录，缺失记录的风险最小。
 *
 * 用法：pnpm changelog
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/** type → 展示分组标题，顺序即输出顺序 */
const SECTIONS = [
  ['feat', '新功能'],
  ['fix', '缺陷修复'],
  ['perf', '性能优化'],
  ['refactor', '重构'],
  ['docs', '文档'],
  ['test', '测试'],
  ['build', '构建与依赖'],
  ['ci', 'CI'],
  ['style', '格式'],
  ['chore', '杂项'],
  ['revert', '回滚'],
];

const UNIT = '\u001f';
const RECORD = '\u001e';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

/** 解析 origin，拿到 commit 链接前缀；非 GitHub 或无 origin 时返回空 */
function commitUrlPrefix() {
  let url;
  try {
    url = git(['config', '--get', 'remote.origin.url']).trim();
  } catch {
    return '';
  }
  const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
  return match ? `https://github.com/${match[1]}/commit/` : '';
}

function readCommits() {
  const raw = git([
    'log',
    `--pretty=format:%H${UNIT}%h${UNIT}%ad${UNIT}%s${RECORD}`,
    '--date=short',
  ]);
  return raw
    .split(RECORD)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, short, date, subject] = line.split(UNIT);
      return { hash, short, date, subject, ...parseHeader(subject) };
    });
}

/** 解析 conventional commit 头部；不匹配时 type 为 null */
function parseHeader(subject) {
  const match = subject.match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/);
  if (!match) return { type: null, scope: null, breaking: false, description: subject };
  const [, type, scope, bang, description] = match;
  return { type: type.toLowerCase(), scope: scope ?? null, breaking: Boolean(bang), description };
}

function renderEntry(c, urlPrefix) {
  const link = urlPrefix ? `[\`${c.short}\`](${urlPrefix}${c.hash})` : `\`${c.short}\``;
  const scope = c.scope ? `**${c.scope}**: ` : '';
  const breaking = c.breaking ? '**[BREAKING]** ' : '';
  return `- ${breaking}${scope}${c.description} — ${link} (${c.date})`;
}

function render(commits, urlPrefix) {
  const lines = [
    '# 变更记录',
    '',
    '> 本文件由 `pnpm changelog` 从 git 历史自动生成，请勿手工编辑。',
    '> 提交格式约束见 README「提交规范」。',
    '',
  ];

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length > 0) {
    lines.push('## 不兼容变更', '');
    for (const c of breaking) lines.push(renderEntry(c, urlPrefix));
    lines.push('');
  }

  for (const [type, title] of SECTIONS) {
    const group = commits.filter((c) => c.type === type);
    if (group.length === 0) continue;
    lines.push(`## ${title}`, '');
    for (const c of group) lines.push(renderEntry(c, urlPrefix));
    lines.push('');
  }

  const others = commits.filter((c) => !SECTIONS.some(([t]) => t === c.type));
  if (others.length > 0) {
    lines.push('## 未分类（不符合 conventional commits 格式的历史提交）', '');
    for (const c of others) lines.push(renderEntry(c, urlPrefix));
    lines.push('');
  }

  return lines.join('\n');
}

const commits = readCommits();
writeFileSync('CHANGELOG.md', render(commits, commitUrlPrefix()), 'utf8');
console.log(`[changelog] 已写入 CHANGELOG.md，共 ${commits.length} 条提交`);
