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
- The website bootstraps display state from `/.auth/me`, calls
  `/api/auth/session` only for an existing platform session, and retains only
  the shared anonymous or provider-independent authenticated session shape.
- Local account configuration is a reviewed Microsoft Graph desired state.
  Protected workflows use OpenID Connect, non-secret tenant/application
  identifiers, and an Azure Key Vault certificate reference; no credential
  value belongs in repository or workflow configuration.
- Google and Facebook federation uses one reviewed desired state containing
  only non-secret references. The protected workflow reads provider credentials
  from Azure Key Vault with the secure-configuration identity, masks them, and
  passes them only to Microsoft Graph after a separate keyless external-tenant
  sign-in.

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

## Iteration 3: Render anonymous and authenticated website state

- Added one application-level authentication provider around the website. It
  exposes loading plus the shared anonymous and authenticated session states,
  remains mounted across client-side navigation, and reloads the managed
  session after a page refresh.
- The session loader first checks the Azure Static Web Apps `/.auth/me`
  envelope. Anonymous, unavailable, or malformed platform sessions remain
  anonymous and never invoke the protected application endpoint.
- Authenticated platform sessions resolve through the same-origin
  `/api/auth/session` endpoint. The browser accepts only the shared anonymous
  shape or an authenticated shape containing a non-empty opaque Game Hub user
  ID; platform identities, claims, details, and tokens are discarded.
- Public content renders while session discovery is loading and after any
  anonymous fallback, so browsing and game play do not trigger an
  authentication redirect.
- The responsive site header presents an accessible live loading status, a
  same-origin Microsoft Entra External ID sign-in link for anonymous visitors,
  or a signed-in status that does not display the internal user ID.
- Added deterministic session-loader, provider, public-content, and header
  tests and included the new runtime modules in coverage. Full `yarn validate`
  passed with 298 tests and `yarn infra:check` passed.
- No identity-provider registration, local or social account lifecycle,
  return-path behavior, sign-out, duplicate-account handling, failure user
  interface, abuse controls, account linking, or live Azure configuration was
  implemented.

## Iteration 4: Enable local account lifecycle

- Added `config/authentication/external-id-local-account.json` as the reviewed
  desired state for the environment-specific Microsoft Entra External ID
  customer user flow.
- Added idempotent Microsoft Graph reconciliation for
  `EmailPassword-OAUTH`, self-service sign-up, verified email collection,
  customer application linking, and enabled email one-time passcodes for
  self-service password reset. Reconciliation preserves identity providers
  added by later stories.
- Added a protected-main External ID workflow that uses a dedicated OpenID
  Connect identity and only non-secret protected environment variables.
- Frontend publication now renders the tenant-scoped Static Web Apps custom
  Microsoft Entra provider, sets only the non-secret application ID, and
  references its client certificate in Azure Key Vault. The Static Web Apps
  managed identity has only Key Vault Certificate User.
- Added an `/account` route with hosted registration/sign-in and
  forgotten-password entry points. Game Hub renders no password input and
  never receives or stores a plaintext password.
- Added deterministic desired-state, reconciliation, deployment-policy,
  contract, header, and account-page coverage. Full `yarn validate` passed with
  305 tests and `yarn infra:check` passed.
- No Google or Facebook federation, provider credential, return-path behavior,
  sign-out change, custom hosted identity screens, live Azure configuration,
  or deployment verification was implemented.

## Iteration 5: Enable Google and Facebook sign-in

- Added `config/authentication/external-id-social-providers.json` as the
  reviewed non-secret desired state for Google and Facebook federation in the
  existing environment-specific customer user flow.
- The committed configuration contains provider types and display names,
  non-secret client-ID environment references, the deterministic environment
  Key Vault name, and provider credential secret aliases. It contains no
  credential value.
- Extended the protected-main External ID workflow to sign in to the approved
  subscription as `AZURE_SECRET_CLIENT_ID`, resolve both provider credentials
  from Azure Key Vault, mask them immediately, and keep them out of GitHub
  secrets, workflow environment/output files, logs, and artifacts.
- The same shell process exchanges a fresh GitHub OpenID Connect assertion for
  the dedicated external-tenant configuration identity. Microsoft Graph then
  creates or synchronizes both `socialIdentityProvider` resources and attaches
  their IDs to the existing local-account user flow.
- Repeated workflow runs reapply the current Key Vault values so provider
  credential rotation converges. Reconciliation output includes only provider
  types, provider IDs, user-flow identity, and change names.
- Added deterministic configuration, reconciliation, rotation, secret-policy,
  and deployment-workflow coverage. Full `yarn validate` passed with 310 tests
  and `yarn infra:check` passed.
- No Google or Facebook application creation, provider credential seeding, live
  Azure configuration, deployed social sign-in verification, return-path
  behavior, sign-out change, error-state work, abuse protection, or later story
  was implemented.
