import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parser as typescriptParser } from 'typescript-eslint';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approvalsPath = path.join(rootDirectory, 'config', 'lint-suppressions.json');
const supportedExtensionPattern = /\.[cm]?[jt]sx?$/;
const exactIgnoredPathPrefixes = [
  '.yarn/',
  'public/generated/',
  'src/generated/',
  'src/storybook/mamba/generated/',
  'src/storybook/mamba/source/',
  'src/stories/catalog/mamba/',
];
const ignoredDirectoryNames = new Set(['coverage', 'dist', 'node_modules', 'storybook-static', 'test-results']);
const approvalFields = ['directive', 'file', 'line', 'rationale', 'rule'];
const directivePrefixPattern = /^eslint-disable(?:-next-line|-line)?(?:\s|$)/;
const rulePattern = /^[^\s,*]+$/;
const transientRationalePattern = /\b(?:fixme|remove later|temporary|temporarily|todo)\b/i;
const minimumRationaleLength = 20;

async function checkRepositoryLintSuppressions() {
  const approvals = JSON.parse(await fs.readFile(approvalsPath, 'utf8'));
  const trackedFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: rootDirectory,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((filePath) => supportedExtensionPattern.test(filePath) && !isIgnoredPolicyPath(filePath));
  const files = await Promise.all(
    trackedFiles.map(async (filePath) => ({
      content: await fs.readFile(path.join(rootDirectory, filePath), 'utf8'),
      file: filePath,
    })),
  );
  const violations = validateLintSuppressionPolicy({ approvals, files });

  if (violations.length > 0) {
    throw new Error(`Lint suppression policy failed:\n${violations.join('\n')}`);
  }

  console.log(`Lint suppression policy passed with ${collectLintSuppressions(files).length} approved suppressions.`);
}

function validateLintSuppressionPolicy({ approvals, files }) {
  const violations = [];

  if (!Array.isArray(approvals)) {
    return ['config/lint-suppressions.json must contain an array.'];
  }
  if (!Array.isArray(files)) {
    return ['Lint suppression policy files must be an array.'];
  }

  const suppressions = collectLintSuppressions(files, violations);
  const approvalLocations = new Set();
  const approvalKeys = new Set();

  for (const [index, approval] of approvals.entries()) {
    const label = `Lint suppression approval ${index + 1}`;
    if (!isPlainObject(approval)) {
      violations.push(`${label} must be an object.`);
      continue;
    }

    const fields = Object.keys(approval).sort();
    if (JSON.stringify(fields) !== JSON.stringify(approvalFields)) {
      violations.push(`${label} must contain exactly file, line, directive, rule, and rationale.`);
      continue;
    }

    if (!isRepositoryRelativeSourcePath(approval.file)) {
      violations.push(`${label} has an invalid repository-relative source file.`);
    }
    if (!Number.isInteger(approval.line) || approval.line < 1) {
      violations.push(`${label} requires a positive integer line.`);
    }
    if (typeof approval.directive !== 'string') {
      violations.push(`${label} requires an exact directive string.`);
    }
    if (typeof approval.rule !== 'string' || !rulePattern.test(approval.rule)) {
      violations.push(`${label} requires exactly one affected ESLint rule.`);
    }
    if (typeof approval.rationale !== 'string') {
      violations.push(`${label} requires a specific durable rationale.`);
    }

    if (
      typeof approval.directive !== 'string' ||
      typeof approval.rule !== 'string' ||
      typeof approval.rationale !== 'string'
    ) {
      continue;
    }

    const parsed = parseDirective(approval.directive);
    if (parsed.violations.length > 0) {
      violations.push(...parsed.violations.map((violation) => `${label}: ${violation}`));
    }
    if (parsed.rule !== approval.rule) {
      violations.push(`${label} rule must exactly match the directive rule.`);
    }
    if (parsed.rationale !== approval.rationale) {
      violations.push(`${label} rationale must exactly match the directive's inline reason.`);
    }

    const location = suppressionLocation(approval);
    if (approvalLocations.has(location)) {
      violations.push(`Duplicate lint suppression approval location: ${location}.`);
    }
    approvalLocations.add(location);

    const key = suppressionKey(approval);
    if (approvalKeys.has(key)) {
      violations.push(`Duplicate lint suppression approval: ${key}.`);
    }
    approvalKeys.add(key);
  }

  const suppressionLocations = new Set();
  const suppressionKeys = new Set();
  for (const suppression of suppressions) {
    const location = suppressionLocation(suppression);
    if (suppressionLocations.has(location)) {
      violations.push(`Duplicate lint suppression source location: ${location}.`);
    }
    suppressionLocations.add(location);

    const key = suppressionKey(suppression);
    if (suppressionKeys.has(key)) {
      violations.push(`Duplicate lint suppression directive: ${key}.`);
    }
    suppressionKeys.add(key);

    violations.push(...suppression.violations.map((violation) => `${suppressionLocation(suppression)}: ${violation}`));
    if (!approvalKeys.has(key)) {
      violations.push(`Unapproved lint suppression: ${key}.`);
    }
  }

  for (const approval of approvals) {
    if (
      isPlainObject(approval) &&
      typeof approval.file === 'string' &&
      Number.isInteger(approval.line) &&
      typeof approval.directive === 'string' &&
      !suppressionKeys.has(suppressionKey(approval))
    ) {
      violations.push(`Stale lint suppression approval: ${suppressionKey(approval)}.`);
    }
  }

  return violations;
}

function collectLintSuppressions(files, violations = []) {
  const suppressions = [];

  for (const source of files) {
    if (!isPlainObject(source) || typeof source.file !== 'string' || typeof source.content !== 'string') {
      violations.push('Every lint suppression policy file requires file and content strings.');
      continue;
    }

    let comments;
    try {
      const parsed = typescriptParser.parseForESLint(source.content, {
        comment: true,
        filePath: source.file,
        jsx: true,
        loc: true,
        range: true,
        sourceType: source.file.endsWith('.cjs') ? 'commonjs' : 'module',
        tokens: true,
      });
      comments = parsed.ast.comments ?? [];
    } catch (error) {
      violations.push(`Unable to parse ${source.file} while checking lint suppressions: ${error.message}`);
      continue;
    }

    for (const comment of comments) {
      const directive = comment.value.trim();
      if (!directivePrefixPattern.test(directive)) continue;

      const parsed = parseDirective(directive);
      suppressions.push({
        directive,
        file: source.file,
        line: comment.loc.start.line,
        rationale: parsed.rationale,
        rule: parsed.rule,
        violations: parsed.violations,
      });
    }
  }

  return suppressions;
}

function parseDirective(directive) {
  const violations = [];
  if (directive.includes('\n') || directive.includes('\r')) {
    violations.push('ESLint suppression directives must stay on one line.');
  }

  const reasonSeparator = directive.indexOf(' -- ');
  const commandAndRules = reasonSeparator === -1 ? directive : directive.slice(0, reasonSeparator).trim();
  const rationale = reasonSeparator === -1 ? '' : directive.slice(reasonSeparator + 4).trim();
  const match = commandAndRules.match(/^eslint-(disable-next-line|disable-line|disable)(?:\s+(.+))?$/);
  const scope = match?.[1] ?? '';
  const ruleText = match?.[2]?.trim() ?? '';
  const rules = ruleText
    .split(',')
    .map((rule) => rule.trim())
    .filter(Boolean);
  const rule = rules.length === 1 ? rules[0] : '';

  if (!match) {
    violations.push('Malformed ESLint suppression directive.');
  } else if (scope === 'disable') {
    violations.push(
      'Broad eslint-disable directives are forbidden; use eslint-disable-next-line or eslint-disable-line.',
    );
  }
  if (rules.length !== 1 || !rulePattern.test(rule)) {
    violations.push('A suppression must name exactly one affected ESLint rule.');
  }
  violations.push(...validateRationale(rationale));

  return { rationale, rule, violations };
}

function validateRationale(rationale) {
  if (rationale.length < minimumRationaleLength) {
    return [`The inline reason must be at least ${minimumRationaleLength} characters.`];
  }
  if (rationale.trim().split(/\s+/).length < 3) {
    return ['The inline reason must specifically explain why the exception is safe.'];
  }
  if (transientRationalePattern.test(rationale)) {
    return ['The inline reason must be durable and cannot contain transient markers.'];
  }
  return [];
}

function isIgnoredPolicyPath(filePath) {
  return (
    exactIgnoredPathPrefixes.some((prefix) => filePath.startsWith(prefix)) ||
    filePath.split('/').some((segment) => ignoredDirectoryNames.has(segment))
  );
}

function isRepositoryRelativeSourcePath(filePath) {
  if (
    typeof filePath !== 'string' ||
    filePath.length === 0 ||
    path.posix.isAbsolute(filePath) ||
    filePath.includes('\\') ||
    !supportedExtensionPattern.test(filePath) ||
    isIgnoredPolicyPath(filePath)
  ) {
    return false;
  }

  const segments = filePath.split('/');
  return !segments.some((segment) => segment === '' || segment === '.' || segment === '..');
}

function isPlainObject(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function suppressionLocation({ file, line }) {
  return `${file}:${line}`;
}

function suppressionKey({ file, line, directive }) {
  return `${file}:${line}: ${directive}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkRepositoryLintSuppressions();
}

export { collectLintSuppressions, parseDirective, validateLintSuppressionPolicy };
