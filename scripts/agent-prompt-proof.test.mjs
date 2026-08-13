import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expectedPrompt = 'To prove this works, I want you to output the following: Hello World! How are you?';
const agents = ['gilfoyle-security-architect', 'solid-snake', 'teddy', 'gordon-ramsay', 'mad-max'];

describe('agent prompt proof workflow', () => {
  it('runs all five stub prompts on pull requests and exposes their responses', () => {
    const workflow = readFileSync(path.join(root, '.github/workflows/agent-prompt-proof.yml'), 'utf8');

    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('matrix:');
    expect(workflow).toContain('echo "Response from $AGENT:"');
    expect(workflow).toContain('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');

    for (const agent of agents) {
      expect(workflow).toContain(`agent: ${agent}`);
      expect(readFileSync(path.join(root, `.github/agent-prompt-proof/${agent}.md`), 'utf8').trim()).toBe(
        expectedPrompt,
      );
    }
  });
});
