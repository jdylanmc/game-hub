import { describe, expect, it } from 'vitest';
import { validateLintSuppressionPolicy } from './check-lint-suppressions.mjs';

const rationale = 'The fixture intentionally exercises console output for policy verification.';
const directive = `eslint-disable-next-line no-console -- ${rationale}`;
const source = `// ${directive}\nconsole.log('policy fixture');\n`;
const approval = {
  file: 'scripts/policy-fixture.mjs',
  line: 1,
  directive,
  rule: 'no-console',
  rationale,
};

function violations({ approvals = [approval], content = source, file = approval.file } = {}) {
  return validateLintSuppressionPolicy({
    approvals,
    files: [{ file, content }],
  });
}

describe('lint suppression policy', () => {
  it('accepts one exact line-scoped, rule-specific, reasoned approval', () => {
    expect(violations()).toEqual([]);
  });

  it('accepts the narrow same-line directive form', () => {
    const sameLineDirective = `eslint-disable-line no-console -- ${rationale}`;
    expect(
      violations({
        approvals: [
          {
            ...approval,
            directive: sameLineDirective,
          },
        ],
        content: `console.log('policy fixture'); // ${sameLineDirective}\n`,
      }),
    ).toEqual([]);
  });

  it('ignores directive-like source strings', () => {
    expect(
      violations({
        approvals: [],
        content: `const example = ${JSON.stringify(directive)};\nconsole.log(example);\n`,
      }),
    ).toEqual([]);
  });

  it.each([
    [
      'unapproved suppression',
      {
        approvals: [],
      },
      /Unapproved lint suppression/,
    ],
    [
      'broad directive',
      {
        approvals: [
          {
            ...approval,
            directive: `eslint-disable no-console -- ${rationale}`,
          },
        ],
        content: `/* eslint-disable no-console -- ${rationale} */\nconsole.log('policy fixture');\n`,
      },
      /Broad eslint-disable directives are forbidden/,
    ],
    [
      'multiple affected rules',
      {
        approvals: [
          {
            ...approval,
            directive: `eslint-disable-next-line no-console, no-alert -- ${rationale}`,
          },
        ],
        content: `// eslint-disable-next-line no-console, no-alert -- ${rationale}\nconsole.log('policy fixture');\n`,
      },
      /exactly one affected ESLint rule/,
    ],
    [
      'reasonless directive',
      {
        approvals: [
          {
            ...approval,
            directive: 'eslint-disable-next-line no-console',
            rationale: '',
          },
        ],
        content: '// eslint-disable-next-line no-console\nconsole.log("policy fixture");\n',
      },
      /inline reason must be at least/,
    ],
    [
      'transient rationale',
      {
        approvals: [
          {
            ...approval,
            directive: 'eslint-disable-next-line no-console -- Temporary workaround until this is fixed later.',
            rationale: 'Temporary workaround until this is fixed later.',
          },
        ],
        content:
          '// eslint-disable-next-line no-console -- Temporary workaround until this is fixed later.\nconsole.log("policy fixture");\n',
      },
      /must be durable/,
    ],
    [
      'duplicate approval',
      {
        approvals: [approval, approval],
      },
      /Duplicate lint suppression approval/,
    ],
    [
      'stale approval',
      {
        content: "console.log('policy fixture');\n",
      },
      /Stale lint suppression approval/,
    ],
    [
      'mismatched affected rule',
      {
        approvals: [{ ...approval, rule: 'no-alert' }],
      },
      /rule must exactly match/,
    ],
    [
      'mismatched external rationale',
      {
        approvals: [{ ...approval, rationale: `${rationale} Extra context.` }],
      },
      /rationale must exactly match/,
    ],
    [
      'additional allowlist fields',
      {
        approvals: [{ ...approval, owner: 'example' }],
      },
      /must contain exactly file, line, directive, rule, and rationale/,
    ],
  ])('rejects %s', (_label, options, expected) => {
    expect(violations(options).join('\n')).toMatch(expected);
  });
});
