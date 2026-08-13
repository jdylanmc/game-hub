#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgentRegistry } from './validate-adversarial-agent-registry.ts';

type JsonObject = Record<string, unknown>;

interface MatrixReviewer {
  agentName: string;
  checkName: string;
  calibrationReport: string;
  deploymentId: string;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(filePath: string): JsonObject {
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isObject(value)) throw new Error(`${filePath} must contain a JSON object`);
  return value;
}

function resolveAdversarialReviewerMatrix(repoRoot: string): MatrixReviewer[] {
  const registry = readObject(path.join(repoRoot, 'config/adversarial-agents/agents-config.json'));
  const validation = validateAgentRegistry(repoRoot, registry);
  if (!validation.valid) throw new Error(`Adversarial reviewer registry is invalid: ${validation.errors.join(' ')}`);
  const enabled = validation.agents.filter((agent) => agent.enabled);
  if (enabled.length === 0) throw new Error('At least one adversarial reviewer must be enabled');
  return enabled.map((agent) => {
    const engine = readObject(path.join(repoRoot, agent.engineConfigFile));
    const deploymentId = engine.expectedDeploymentId;
    if (typeof deploymentId !== 'string' || deploymentId.length === 0) {
      throw new Error(`Enabled reviewer ${agent.name} has no reviewed deployment ID`);
    }
    return {
      agentName: agent.name,
      checkName: agent.checkName,
      calibrationReport: agent.activeCalibrationReportFile,
      deploymentId,
    };
  });
}

function main(): void {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--github-output');
  const repoRoot = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : '.');
  const matrix = JSON.stringify({ include: resolveAdversarialReviewerMatrix(repoRoot) });
  if (outputIndex >= 0) {
    const outputPath = args[outputIndex + 1];
    if (!outputPath) throw new Error('--github-output requires a path');
    fs.appendFileSync(outputPath, `reviewer_matrix=${matrix}\n`);
  } else {
    process.stdout.write(`${matrix}\n`);
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

export { resolveAdversarialReviewerMatrix };
export type { MatrixReviewer };
