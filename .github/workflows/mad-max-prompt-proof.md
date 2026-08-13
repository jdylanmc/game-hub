---
name: Mad Max Prompt Proof
description: Runs the Mad Max stub prompt on pull requests
on:
  workflow_run:
    workflows: [Agent Prompt Proof Trigger]
    types: [completed]
    branches: ["**"]
if: github.event.workflow_run.conclusion == 'success'
permissions:
  contents: read
  id-token: write
environment: adversarial-review
checkout: false
engine:
  id: copilot
  version: 1.0.79
  bare: true
  env:
    COPILOT_PROVIDER_BASE_URL: ${{ vars.AZURE_OPENAI_ENDPOINT }}/openai/v1
    COPILOT_PROVIDER_MODEL_ID: gpt-4.1-mini
    COPILOT_PROVIDER_WIRE_MODEL: game-hub-unit-test-reviewer
    COPILOT_PROVIDER_WIRE_API: completions
  auth:
    type: github-oidc
    provider: azure
    azure-tenant-id: ${{ vars.AZURE_TENANT_ID }}
    azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
model: gpt-4.1-mini
models:
  default-ai-credits-pricing:
    input: 0.4
    output: 1.6
max-ai-credits: 100
timeout-minutes: 5
sandbox:
  agent:
    model-fallback: false
network:
  allowed:
    - defaults
    - login.microsoftonline.com
    - game-hub-adversarial-openai.openai.azure.com
concurrency:
  group: mad-max-prompt-proof-${{ github.event.workflow_run.id }}
  cancel-in-progress: true
safe-outputs:
  report-failed-jobs: false
  threat-detection: false
  jobs:
    prompt-output:
      description: Record the exact prompt response in the Actions log
      runs-on: ubuntu-latest
      permissions: {}
      inputs:
        response:
          description: The exact response to the stub prompt
          type: string
          required: true
      steps:
        - name: Print prompt response
          uses: actions/github-script@v9
          with:
            script: |
              const fs = require('fs');
              const data = JSON.parse(fs.readFileSync(process.env.GH_AW_AGENT_OUTPUT, 'utf8'));
              const items = (data.items || []).filter(item => item.type === 'prompt_output');
              if (items.length !== 1 || !items[0].response?.trim()) {
                core.setFailed(`Expected exactly one prompt_output response, received ${items.length}.`);
                return;
              }
              core.info(items[0].response);
---

To prove this works, I want you to output the following: Hello World! How are you?
