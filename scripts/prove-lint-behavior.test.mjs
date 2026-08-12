import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseEslintJsonOutput,
  validateRuleFailureEvidence,
  validateWarningFailureEvidence,
} from './prove-lint-behavior.mjs';

const expectedFilePath = path.resolve('src/lint-proof.ts');

function result({
  errorCount = 1,
  fatal = false,
  filePath = expectedFilePath,
  ruleId = '@typescript-eslint/no-unused-vars',
  severity = 2,
  warningCount = 0,
} = {}) {
  return {
    errorCount,
    filePath,
    messages: [
      {
        column: 7,
        fatal,
        line: 1,
        message: 'Representative diagnostic.',
        ruleId,
        severity,
      },
    ],
    warningCount,
  };
}

describe('lint behavior evidence validation', () => {
  it('accepts an isolated actionable rule failure', () => {
    expect(
      validateRuleFailureEvidence({
        expectedFilePath,
        expectedRules: ['@typescript-eslint/no-unused-vars'],
        results: [result()],
        status: 1,
      }),
    ).toEqual([]);
  });

  it.each([
    ['setup exit status', { status: 2 }, /status 1/],
    ['fatal parser diagnostic', { results: [result({ fatal: true, ruleId: null })] }, /Fatal parser or setup/],
    ['unexpected rule', { results: [result({ ruleId: 'import-x/no-unresolved' })] }, /Unexpected rule/],
    [
      'warning-only diagnostic',
      { results: [result({ errorCount: 0, severity: 1, warningCount: 1 })] },
      /must be errors/,
    ],
  ])('rejects an unrelated %s', (_label, overrides, expected) => {
    const violations = validateRuleFailureEvidence({
      expectedFilePath,
      expectedRules: ['@typescript-eslint/no-unused-vars'],
      results: [result()],
      status: 1,
      ...overrides,
    });
    expect(violations.join('\n')).toMatch(expected);
  });

  it('accepts exactly one canonical warning and rejects accompanying errors', () => {
    const warning = result({
      errorCount: 0,
      ruleId: 'no-console',
      severity: 1,
      warningCount: 1,
    });
    expect(
      validateWarningFailureEvidence({
        expectedFilePath,
        results: [warning],
        status: 1,
        stderr: 'ESLint found too many warnings (maximum: 0).',
      }),
    ).toEqual([]);

    expect(
      validateWarningFailureEvidence({
        expectedFilePath,
        results: [warning, result()],
        status: 1,
        stderr: 'ESLint found too many warnings (maximum: 0).',
      }).join('\n'),
    ).toMatch(/exactly one warning diagnostic/);
  });

  it('extracts structured ESLint output after canonical scope evidence', () => {
    expect(parseEslintJsonOutput(`Lint scope policy passed.\n${JSON.stringify([result()])}\n`)).toEqual([result()]);
  });
});
