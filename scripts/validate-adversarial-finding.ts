#!/usr/bin/env node

/**
 * Adversarial Agent Finding Validator
 *
 * Validates JSON findings output from adversarial agents against the schema.
 * Enforces:
 * - Schema version compliance
 * - Required fields presence
 * - Field type and format correctness
 * - Citation completeness and actionability
 * - Policy compliance (verdict rules)
 *
 * Exit codes:
 * - 0: Valid
 * - 1: Invalid JSON or missing required fields
 * - 2: Invalid field values or formats
 * - 3: Policy violation (unactionable results)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Schema version this validator expects
const SUPPORTED_SCHEMA_VERSION = '1.0.0';
const POLICY_VERSION = '1.0.0';

interface ValidationError {
  code: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  schemaVersion: string;
  agentName: string;
  findingCount: number;
  blockingCount: number;
  advisoryCount: number;
}

class AdversarialFindingValidator {
  private schemaPath: string;
  private policyPath: string;
  private agentPath: string;

  constructor(repoRoot: string = '.') {
    this.schemaPath = path.join(repoRoot, 'config/adversarial-agents/schema.json');
    this.policyPath = path.join(repoRoot, 'config/adversarial-agents/policy.json');
    this.agentPath = path.join(repoRoot, 'config/adversarial-agents/agents.json');
  }

  /**
   * Load and parse JSON file
   */
  private loadJSON(filePath: string): any {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Failed to load ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate finding JSON against schema and policy
   */
  validate(findingJSON: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // 1. Validate schemaVersion
    if (!findingJSON.schemaVersion) {
      errors.push({
        code: 1,
        field: 'schemaVersion',
        message: 'schemaVersion is required',
        severity: 'error',
      });
    } else if (findingJSON.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
      errors.push({
        code: 2,
        field: 'schemaVersion',
        message: `Unsupported schema version: ${findingJSON.schemaVersion}. Expected ${SUPPORTED_SCHEMA_VERSION}`,
        severity: 'error',
      });
    }

    // 2. Validate required top-level fields
    const requiredFields = ['schemaVersion', 'findingVersion', 'verdict', 'findings', 'attribution'];
    for (const field of requiredFields) {
      if (!(field in findingJSON)) {
        errors.push({
          code: 1,
          field,
          message: `Required field "${field}" is missing`,
          severity: 'error',
        });
      }
    }

    // 3. Validate verdict structure
    if (findingJSON.verdict) {
      const verdict = findingJSON.verdict;
      if (!verdict.decision) {
        errors.push({
          code: 1,
          field: 'verdict.decision',
          message: 'verdict.decision is required',
          severity: 'error',
        });
      } else if (!['PASS', 'FAIL', 'ERROR'].includes(verdict.decision)) {
        errors.push({
          code: 2,
          field: 'verdict.decision',
          message: `verdict.decision must be one of: PASS, FAIL, ERROR. Got: ${verdict.decision}`,
          severity: 'error',
        });
      }

      if (!verdict.severity) {
        errors.push({
          code: 1,
          field: 'verdict.severity',
          message: 'verdict.severity is required',
          severity: 'error',
        });
      } else if (!['INFO', 'ADVISORY', 'BLOCKING', 'ERROR'].includes(verdict.severity)) {
        errors.push({
          code: 2,
          field: 'verdict.severity',
          message: `verdict.severity must be one of: INFO, ADVISORY, BLOCKING, ERROR. Got: ${verdict.severity}`,
          severity: 'error',
        });
      }

      // Check policy: FAIL requires BLOCKING findings
      if (verdict.decision === 'FAIL') {
        if (!verdict.blockingFindingsCount || verdict.blockingFindingsCount === 0) {
          errors.push({
            code: 3,
            field: 'verdict',
            message: 'FAIL verdict requires at least one blocking finding. Got blockingFindingsCount: 0',
            severity: 'error',
          });
        }
      }
    }

    // 4. Validate findings array
    if (Array.isArray(findingJSON.findings)) {
      const findings = findingJSON.findings;
      let blockingCount = 0;
      let advisoryCount = 0;

      for (let i = 0; i < findings.length; i++) {
        const finding = findings[i];
        const findingErrors = this.validateFinding(finding, i);
        errors.push(...findingErrors.errors);
        warnings.push(...findingErrors.warnings);

        if (finding.severity === 'BLOCKING') blockingCount++;
        if (finding.severity === 'ADVISORY') advisoryCount++;
      }

      // Verify counts match verdict
      if (findingJSON.verdict) {
        if (findingJSON.verdict.blockingFindingsCount !== blockingCount) {
          warnings.push({
            code: 2,
            field: 'verdict.blockingFindingsCount',
            message: `blockingFindingsCount mismatch: declared ${findingJSON.verdict.blockingFindingsCount}, found ${blockingCount}`,
            severity: 'warning',
          });
        }
        if (findingJSON.verdict.advisoryFindingsCount !== advisoryCount) {
          warnings.push({
            code: 2,
            field: 'verdict.advisoryFindingsCount',
            message: `advisoryFindingsCount mismatch: declared ${findingJSON.verdict.advisoryFindingsCount}, found ${advisoryCount}`,
            severity: 'warning',
          });
        }
      }
    } else {
      errors.push({
        code: 1,
        field: 'findings',
        message: 'findings must be an array',
        severity: 'error',
      });
    }

    // 5. Validate attribution
    if (findingJSON.attribution) {
      const attr = findingJSON.attribution;
      const attrRequired = [
        'agentName',
        'agentVersion',
        'modelDeployment',
        'promptVersion',
        'promptContentHash',
        'policyVersion',
        'toolsVersion',
      ];
      for (const field of attrRequired) {
        if (!(field in attr)) {
          errors.push({
            code: 1,
            field: `attribution.${field}`,
            message: `Required attribution field "${field}" is missing`,
            severity: 'error',
          });
        }
      }

      // Validate version formats
      if (attr.promptVersion && !this.isSemanticVersion(attr.promptVersion)) {
        errors.push({
          code: 2,
          field: 'attribution.promptVersion',
          message: `Invalid semantic version: ${attr.promptVersion}`,
          severity: 'error',
        });
      }

      // Validate hash format
      if (attr.promptContentHash && !/^[a-f0-9]{64}$/.test(attr.promptContentHash)) {
        errors.push({
          code: 2,
          field: 'attribution.promptContentHash',
          message: 'promptContentHash must be a 64-character hex string (SHA-256)',
          severity: 'error',
        });
      }
    }

    // 6. Validate findingVersion format
    if (
      findingJSON.findingVersion &&
      !/^[a-z0-9]+(-[a-z0-9]+)*@\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(findingJSON.findingVersion)
    ) {
      errors.push({
        code: 2,
        field: 'findingVersion',
        message: `Invalid findingVersion format: ${findingJSON.findingVersion}. Expected format: agent-name@YYYY-MM-DDTHH:MM:SSZ`,
        severity: 'error',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      schemaVersion: findingJSON.schemaVersion || 'unknown',
      agentName: findingJSON.attribution?.agentName || 'unknown',
      findingCount: Array.isArray(findingJSON.findings) ? findingJSON.findings.length : 0,
      blockingCount: findingJSON.verdict?.blockingFindingsCount || 0,
      advisoryCount: findingJSON.verdict?.advisoryFindingsCount || 0,
    };
  }

  /**
   * Validate a single finding object
   */
  private validateFinding(finding: any, index: number): { errors: ValidationError[]; warnings: ValidationError[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    const findingPrefix = `findings[${index}]`;

    // Required fields
    const required = ['id', 'title', 'category', 'severity', 'confidence', 'description'];
    for (const field of required) {
      if (!(field in finding)) {
        errors.push({
          code: 1,
          field: `${findingPrefix}.${field}`,
          message: `Required field "${field}" is missing`,
          severity: 'error',
        });
      }
    }

    // Validate category
    const validCategories = [
      'tautology',
      'mock-evasion',
      'missing-error-case',
      'missing-branch',
      'race-condition',
      'snapshot-only',
      'duplicate-implementation',
      'weak-assertion',
      'focused-test',
      'missing-edge-case',
      'authorization-bypass',
      'cleanup-leak',
      'determinism-issue',
      'other',
    ];
    if (finding.category && !validCategories.includes(finding.category)) {
      errors.push({
        code: 2,
        field: `${findingPrefix}.category`,
        message: `Invalid category: ${finding.category}`,
        severity: 'error',
      });
    }

    // Validate severity and confidence
    if (finding.severity && !['BLOCKING', 'ADVISORY'].includes(finding.severity)) {
      errors.push({
        code: 2,
        field: `${findingPrefix}.severity`,
        message: `Invalid severity: ${finding.severity}. Must be BLOCKING or ADVISORY`,
        severity: 'error',
      });
    }

    if (finding.confidence && !['HIGH', 'MEDIUM', 'LOW'].includes(finding.confidence)) {
      errors.push({
        code: 2,
        field: `${findingPrefix}.confidence`,
        message: `Invalid confidence: ${finding.confidence}. Must be HIGH, MEDIUM, or LOW`,
        severity: 'error',
      });
    }

    // Check actionability: findings should have citations, scenarios, and suggested tests
    if (!finding.citations || Object.keys(finding.citations).length === 0) {
      errors.push({
        code: 3,
        field: `${findingPrefix}.citations`,
        message: 'Finding must have citations (specific file paths and line numbers)',
        severity: 'error',
      });
    } else {
      // Validate citations structure
      const citations = finding.citations;
      if (Array.isArray(citations.testFiles) && citations.testFiles.length > 0) {
        for (let i = 0; i < citations.testFiles.length; i++) {
          const file = citations.testFiles[i];
          if (!file.path) {
            errors.push({
              code: 3,
              field: `${findingPrefix}.citations.testFiles[${i}]`,
              message: 'Citation must have a path',
              severity: 'error',
            });
          }
          if (!file.startLine || !file.endLine) {
            errors.push({
              code: 3,
              field: `${findingPrefix}.citations.testFiles[${i}]`,
              message: 'Citation must have startLine and endLine',
              severity: 'error',
            });
          }
        }
      }
    }

    if (!finding.missingScenario || finding.missingScenario.trim().length === 0) {
      errors.push({
        code: 3,
        field: `${findingPrefix}.missingScenario`,
        message: 'missingScenario must be provided and non-empty',
        severity: 'error',
      });
    }

    if (!finding.expectedFailureSignal || finding.expectedFailureSignal.trim().length === 0) {
      errors.push({
        code: 3,
        field: `${findingPrefix}.expectedFailureSignal`,
        message: 'expectedFailureSignal must be provided and non-empty',
        severity: 'error',
      });
    }

    if (!finding.suggestedTest || finding.suggestedTest.trim().length === 0) {
      errors.push({
        code: 3,
        field: `${findingPrefix}.suggestedTest`,
        message: 'suggestedTest must be provided and non-empty',
        severity: 'error',
      });
    }

    return { errors, warnings };
  }

  /**
   * Check if a string is a valid semantic version
   */
  private isSemanticVersion(version: string): boolean {
    return /^\d+\.\d+\.\d+$/.test(version);
  }

  /**
   * Compute SHA-256 hash of a file
   */
  static computeFileHash(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

// Main: validate JSON from stdin or file argument
async function main() {
  const inputArg = process.argv[2];
  let findingJSON: any;

  try {
    if (inputArg) {
      // Read from file
      if (!fs.existsSync(inputArg)) {
        console.error(`Error: File not found: ${inputArg}`);
        process.exit(1);
      }
      const content = fs.readFileSync(inputArg, 'utf-8');
      findingJSON = JSON.parse(content);
    } else {
      // Read from stdin
      const chunks: string[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk.toString());
      }
      findingJSON = JSON.parse(chunks.join(''));
    }
  } catch (error) {
    console.error(`Error: Invalid JSON input: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // Run validation
  const validator = new AdversarialFindingValidator();
  const result = validator.validate(findingJSON);

  // Output results
  console.log(JSON.stringify(result, null, 2));

  // Exit with code based on validation
  if (result.errors.some((e) => e.code === 3)) {
    process.exit(3); // Policy violation
  } else if (result.errors.length > 0) {
    process.exit(2); // Invalid format
  } else if (!result.valid) {
    process.exit(1); // Other validation failure
  }

  process.exit(0); // Success
}

main().catch((error) => {
  console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

export { AdversarialFindingValidator, ValidationResult, ValidationError };
