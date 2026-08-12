# Authentication Contract Workspace Agent Guide

`@game-hub/auth-contract` defines the shared authentication boundary used by
the website and application programming interface (API). Read the
[root agent guide](../../AGENTS.md) and
[authentication architecture](../../docs/authentication-architecture.md)
before editing this workspace.

## Workspace Contract

- Keep browser-visible sessions limited to anonymous state or an opaque
  provider-independent Game Hub user ID.
- Keep platform subjects, provider tokens, credentials, claims, and profile
  details outside browser session responses.
- Keep endpoint paths same-origin and non-secret.
- Update both website and API tests when changing an exported contract.

## Validation

Run `yarn typecheck`, `yarn test`, and `yarn build` after contract changes.
