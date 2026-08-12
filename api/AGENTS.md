# Game Hub API Workspace Agent Guide

The Game Hub application programming interface (API) runs in the Azure
Container Apps backend linked to Azure Static Web Apps. Read the
[root agent guide](../AGENTS.md) and
[authentication architecture](../docs/authentication-architecture.md) before
editing this workspace.

## Trust and Identity

- Trust `x-ms-client-principal` only behind the Azure Static Web Apps linked
  backend. Keep all other browser-facing API access same-origin through
  `/api/*`.
- Require the configured provider and `authenticated` role before resolving an
  identity.
- Never use email, display name, claims, or provider labels to merge users.
- Store only a one-way hash of the platform identity key, the opaque Game Hub
  user ID, and creation metadata.
- Return a typed conflict when identity storage cannot resolve exactly one
  mapping. Return a typed service failure when storage is unavailable; never
  disguise either state as an anonymous session.
- Access Azure Tables with the API runtime managed identity. Do not add storage
  keys, connection strings, provider credentials, or browser-readable secrets.

## Validation

Run `yarn workspace @game-hub/api typecheck`, the API tests, `yarn infra:check`,
and the root validation command for published changes.
