# Progress

## Codebase Patterns

- Azure Front Door Premium is the canonical browser origin. Azure Static Web
  Apps owns the static host and proxies same-origin `/api/*` requests to its
  linked Azure Container Apps backend.
- The linked API receives the Azure Static Web Apps principal through
  `x-ms-client-principal`; browser-supplied copies outside that boundary are
  untrusted.
- API identity mappings use a dedicated Azure Tables account with shared-key
  access disabled. The runtime managed identity has Storage Table Data
  Contributor access, and the stored row key is a SHA-256 digest of provider
  plus platform subject.
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

## Iteration 2: Resolve internal identities and sessions

- Added `api/` as a Node.js and TypeScript workspace for the linked Azure
  Container Apps boundary, plus a production container definition that builds
  from the monorepo without embedding credentials.
- Moved the shared authentication contract to
  `packages/auth-contract/`; the website re-exports it from the existing path
  and the API consumes the same anonymous and authenticated session types.
- Added strict non-secret runtime configuration for the Static Web Apps
  principal header, `aad` provider alias, authenticated role, Azure Tables
  endpoint and table, runtime managed-identity client ID, and port.
- The API accepts identity only from the injected `x-ms-client-principal`,
  validates the provider and authenticated role, and ignores user details,
  claims, and provider tokens. Missing or invalid principals return the shared
  anonymous session shape without creating an identity.
- Added durable race-safe resolution from the platform provider and subject to
  one generated opaque Game Hub user ID. Azure Tables stores only a SHA-256
  lookup key, the internal ID, and creation time; concurrent first sign-ins
  converge on the winning record.
- Added a dedicated identity storage module with shared-key access disabled,
  Microsoft Entra authentication by default, Storage Table Data Contributor
  for the existing API runtime identity, non-secret environment wiring, and
  Azure Monitor diagnostics.
- Added deterministic configuration, principal-validation, identity-resolution,
  endpoint, and HTTP-server tests. Full `yarn validate` passed with 286 tests,
  coverage, immutable install, formatting, lint, policy, fail-closed
  simulations, security audit, generated-state, type, production website and
  API builds, bundle budgets, and Storybook. `yarn infra:check` also passed for
  all Bicep modules and environment parameter files.
- No login or account user interface, Google or Facebook provider
  registration, provider credential, live Azure deployment, account linking,
  return-path behavior, or sign-out behavior was implemented.
