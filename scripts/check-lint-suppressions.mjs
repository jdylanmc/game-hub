import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approvalsPath = path.join(rootDirectory, 'config', 'lint-suppressions.json');
const supportedExtensionPattern = /\.[cm]?[jt]sx?$/;
const ignoredPathPrefixes = [
  '.yarn/',
  'coverage/',
  'dist/',
  'storybook-static/',
  'src/storybook/mamba/generated/',
  'src/storybook/mamba/source/',
];
const directivePattern = new RegExp(`eslint-${'disable'}(?:-next-line|-line)?(?:\\s+[^\\r\\n*]+)?`, 'g');

const approvals = JSON.parse(await fs.readFile(approvalsPath, 'utf8'));
if (!Array.isArray(approvals)) {
  throw new Error('config/lint-suppressions.json must contain an array.');
}

const trackedFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
  cwd: rootDirectory,
  encoding: 'utf8',
})
  .split('\0')
  .filter(
    (filePath) =>
      supportedExtensionPattern.test(filePath) && !ignoredPathPrefixes.some((prefix) => filePath.startsWith(prefix)),
  );

const suppressions = [];
for (const filePath of trackedFiles) {
  const content = await fs.readFile(path.join(rootDirectory, filePath), 'utf8');
  for (const match of content.matchAll(directivePattern)) {
    suppressions.push({
      file: filePath,
      line: content.slice(0, match.index).split('\n').length,
      directive: match[0].trim(),
    });
  }
}

const approvalKeys = new Set();
for (const approval of approvals) {
  if (
    typeof approval?.file !== 'string' ||
    !Number.isInteger(approval.line) ||
    typeof approval.directive !== 'string' ||
    typeof approval.rationale !== 'string' ||
    approval.rationale.trim().length < 10
  ) {
    throw new Error(
      'Every lint suppression approval requires file, line, directive, and a rationale of at least 10 characters.',
    );
  }

  const key = suppressionKey(approval);
  if (approvalKeys.has(key)) {
    throw new Error(`Duplicate lint suppression approval: ${key}.`);
  }
  approvalKeys.add(key);
}

const suppressionKeys = new Set(suppressions.map(suppressionKey));
const unapproved = suppressions.filter((suppression) => !approvalKeys.has(suppressionKey(suppression)));
const stale = approvals.filter((approval) => !suppressionKeys.has(suppressionKey(approval)));

if (unapproved.length > 0 || stale.length > 0) {
  const messages = [
    ...unapproved.map((suppression) => `Unapproved lint suppression: ${suppressionKey(suppression)}`),
    ...stale.map((approval) => `Stale lint suppression approval: ${suppressionKey(approval)}`),
  ];
  throw new Error(messages.join('\n'));
}

console.log(`Lint suppression policy passed with ${suppressions.length} approved suppressions.`);

function suppressionKey({ file, line, directive }) {
  return `${file}:${line}: ${directive}`;
}
