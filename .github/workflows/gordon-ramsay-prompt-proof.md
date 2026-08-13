---
name: Gordon Ramsay Prompt Proof
description: Runs the Gordon Ramsay stub prompt on pull requests
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
    COPILOT_PROVIDER_BASE_URL: ${{ vars.AZURE_OPENAI_ENDPOINT }}
    COPILOT_PROVIDER_MODEL_ID: gpt-4.1-mini
    COPILOT_PROVIDER_WIRE_MODEL: game-hub-unit-test-reviewer
    COPILOT_PROVIDER_WIRE_API: responses
  auth:
    type: github-oidc
    provider: azure
    azure-tenant-id: ${{ vars.AZURE_TENANT_ID }}
    azure-client-id: ${{ vars.AZURE_CLIENT_ID }}
model: gpt-4.1-mini
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
  group: gordon-ramsay-prompt-proof-${{ github.event.workflow_run.id }}
  cancel-in-progress: true
jobs:
  finalize:
    needs: [agent]
    if: always()
    runs-on: ubuntu-latest
    permissions: {}
    steps:
      - name: Download prompt response
        if: needs.agent.result == 'success'
        uses: actions/download-artifact@v8
        with:
          name: agent
          path: ${{ runner.temp }}/prompt-response
      - name: Print prompt response
        if: needs.agent.result == 'success'
        run: cat "${RUNNER_TEMP}/prompt-response/agent_output.json"
      - name: Require successful prompt run
        if: needs.agent.result != 'success'
        run: exit 1
---

To prove this works, I want you to output the following: Hello World! How are you?
