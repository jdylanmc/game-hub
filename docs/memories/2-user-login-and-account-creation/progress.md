# Progress

## Codebase Patterns

- Azure Front Door Premium is the canonical browser origin. Azure Static Web
  Apps owns the static host and proxies same-origin `/api/*` requests to its
  linked Azure Container Apps backend.
- The linked API receives the Azure Static Web Apps principal through
  `x-ms-client-principal`; browser-supplied copies outside that boundary are
  untrusted.
- Azure deployment uses Microsoft Entra workload identity federation. Runtime
  secrets use Azure Key Vault references and secret values must not enter
  source, parameters, outputs, logs, artifacts, memory, or pull requests.
- Every new Yarn workspace needs its own `AGENTS.md`.

## Iteration 1: Select the identity architecture and contracts

- Started from `origin/main` commit
  `2bb2fc0485c0fc6b17912410fad17677be4d59f8` after merged hosting
  infrastructure pull request #38.
- Selected Microsoft Entra External ID in an external tenant as the customer
  identity service, federated to Azure Static Web Apps through one custom
  Microsoft Entra provider. The shared External ID user flow can offer local
  email/password, Google, and Facebook without making Game Hub a password
  processor.
- Kept anonymous access as the default and separated the platform identity
  reference from the stable internal Game Hub user ID.
- Preserved account linking, session lifetime and revocation, and
  age/privacy/deletion policy as unresolved issue decisions for later stories.
- Added `src/auth/contract.ts` for the three credential methods, selected
  services, custom provider route, trusted platform subject, opaque internal
  user ID, anonymous/authenticated states, and same-origin session endpoints.
- Added deterministic contract tests. Full `yarn validate` passed with 260
  tests plus immutable install, formatting, lint, policy, fail-closed
  simulations, security audit, coverage, generated-state, type, production
  build, bundle budget, and Storybook gates.
- No Azure resource, provider registration, deployment, authentication user
  interface, or live authentication flow was created or verified.
