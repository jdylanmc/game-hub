import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDeterministicSecurityEvidence } from './build-deterministic-security-evidence.ts';
import { checkContainerSecuritySurface } from './check-container-security-surface.ts';
import { scanSecretDiff } from './check-secret-exposure.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workRoot = path.join(root, '.deterministic-security-test-work');
const config = JSON.parse(
  fs.readFileSync(
    path.join(root, 'config/adversarial-agents/gilfoyle-security-architect/deterministic-evidence.json'),
    'utf8',
  ),
);

function git(repo, ...args) {
  const result = spawnSync('git', ['-C', repo, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function commit(repo, message) {
  git(repo, 'add', '-A');
  git(repo, '-c', 'user.name=Security Test', '-c', 'user.email=security@example.invalid', 'commit', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

function createRepository() {
  fs.mkdirSync(workRoot, { recursive: true });
  const repo = fs.mkdtempSync(path.join(workRoot, 'repo-'));
  git(repo, 'init', '--quiet');
  write(path.join(repo, 'README.md'), 'safe\n');
  const baseSha = commit(repo, 'base');
  return { repo, baseSha };
}

function createBuilderFixture(securitySeverity = 5) {
  fs.mkdirSync(workRoot, { recursive: true });
  const directory = fs.mkdtempSync(path.join(workRoot, 'builder-'));
  write(
    path.join(directory, 'codeql/results.sarif'),
    JSON.stringify({
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              rules: [
                {
                  id: 'js/example',
                  properties: { 'security-severity': String(securitySeverity) },
                },
              ],
            },
          },
          results: [
            {
              ruleId: 'js/example',
              ruleIndex: 0,
              level: 'warning',
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: 'src/example.ts' },
                    region: { startLine: 7 },
                  },
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  write(
    path.join(directory, 'secrets.json'),
    JSON.stringify({ schemaVersion: '1.0.0', status: 'PASS', findingCount: 0, findings: [] }),
  );
  write(
    path.join(directory, 'bicep.json'),
    JSON.stringify({ schemaVersion: '1.0.0', status: 'PASS', compiledFiles: ['infra/main.bicep'] }),
  );
  write(
    path.join(directory, 'containers.json'),
    JSON.stringify({
      schemaVersion: '1.0.0',
      status: 'NOT_APPLICABLE',
      reason: 'No tracked container definitions exist.',
    }),
  );
  write(path.join(directory, 'audit.log'), 'No audit suggestions\n');
  write(path.join(directory, 'policy.log'), 'Repository policy passed\n');
  return directory;
}

function builderArguments(directory) {
  return {
    repository: 'jdylanmc/game-hub',
    eventName: 'pull_request',
    baseSha: '1'.repeat(40),
    headSha: '2'.repeat(40),
    workflowName: 'Continuous integration',
    workflowRunId: '12345',
    workflowRunAttempt: 1,
    generatedAt: '2026-08-12T00:00:00.000Z',
    outputPath: path.join(directory, 'manifest.json'),
    configPath: 'unused.json',
    codeqlPath: path.join(directory, 'codeql'),
    secretsPath: path.join(directory, 'secrets.json'),
    bicepPath: path.join(directory, 'bicep.json'),
    containersPath: path.join(directory, 'containers.json'),
    auditLogPath: path.join(directory, 'audit.log'),
    policyLogPath: path.join(directory, 'policy.log'),
  };
}

afterEach(() => {
  fs.rmSync(workRoot, { recursive: true, force: true });
  for (const name of [
    'DEPENDENCY_CHANGES_JSON',
    'DEPENDENCY_VULNERABLE_CHANGES_JSON',
    'DEPENDENCY_INVALID_LICENSE_CHANGES_JSON',
    'DEPENDENCY_DENIED_CHANGES_JSON',
  ]) {
    delete process.env[name];
  }
});

describe('deterministic security evidence', () => {
  it('detects redacted high-confidence secrets and unscannable binary changes', () => {
    const fixture = createRepository();
    const fakeToken = 'gh' + 'p_' + 'a'.repeat(40);
    write(path.join(fixture.repo, 'credential.txt'), `${fakeToken}\n`);
    write(path.join(fixture.repo, 'binary.bin'), Buffer.from([0, 1, 2, 3]));
    const headSha = commit(fixture.repo, 'unsafe');

    const result = scanSecretDiff(fixture.repo, fixture.baseSha, headSha);

    expect(result.status).toBe('FAIL');
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(['github-token', 'unscannable-binary-change']),
    );
    expect(JSON.stringify(result)).not.toContain(fakeToken);
  });

  it('makes absent containers explicit and fails closed when a container surface appears', () => {
    const fixture = createRepository();
    expect(checkContainerSecuritySurface(fixture.repo)).toMatchObject({
      status: 'NOT_APPLICABLE',
      files: [],
    });

    write(path.join(fixture.repo, 'Dockerfile'), 'FROM scratch\n');
    git(fixture.repo, 'add', 'Dockerfile');
    expect(checkContainerSecuritySurface(fixture.repo)).toMatchObject({
      status: 'UNSUPPORTED',
      files: ['Dockerfile'],
    });
  });

  it('builds bounded attributable passing evidence from every required check', () => {
    const directory = createBuilderFixture();
    for (const name of [
      'DEPENDENCY_CHANGES_JSON',
      'DEPENDENCY_VULNERABLE_CHANGES_JSON',
      'DEPENDENCY_INVALID_LICENSE_CHANGES_JSON',
      'DEPENDENCY_DENIED_CHANGES_JSON',
    ]) {
      process.env[name] = '[]';
    }

    const result = buildDeterministicSecurityEvidence(directory, builderArguments(directory), config);

    expect(result.exitCode).toBe(0);
    expect(result.manifest).toMatchObject({
      status: 'PASS',
      authority: {
        deterministicFailuresOverridableByAgent: false,
        instructionsFromEvidenceAllowed: false,
      },
    });
    expect(result.manifest.checks.map((check) => check.id)).toEqual(config.requiredChecks);
    expect(result.manifest.checks.find((check) => check.id === 'container-scan')).toMatchObject({
      status: 'NOT_APPLICABLE',
    });
    expect(Buffer.byteLength(JSON.stringify(result.manifest))).toBeLessThan(config.limits.maxManifestBytes);
  });

  it('cannot turn a blocking CodeQL finding into passing evidence', () => {
    const directory = createBuilderFixture(9);
    for (const name of [
      'DEPENDENCY_CHANGES_JSON',
      'DEPENDENCY_VULNERABLE_CHANGES_JSON',
      'DEPENDENCY_INVALID_LICENSE_CHANGES_JSON',
      'DEPENDENCY_DENIED_CHANGES_JSON',
    ]) {
      process.env[name] = '[]';
    }

    const result = buildDeterministicSecurityEvidence(directory, builderArguments(directory), config);

    expect(result.exitCode).toBe(2);
    expect(result.manifest).toMatchObject({ status: 'FAIL' });
    expect(result.manifest.checks.find((check) => check.id === 'codeql')).toMatchObject({
      status: 'FAIL',
      blockingFindingCount: 1,
    });
  });
});
