# Game Hub Authentication Architecture

## Decision

Game Hub will use **Microsoft Entra External ID in an external tenant** as its
customer identity service and **Azure Static Web Apps custom authentication**
as the website session boundary.

One Microsoft Entra External ID sign-up and sign-in user flow will offer:

- local email-and-password registration and sign-in;
- Google federation; and
- Facebook federation.

Azure Static Web Apps will register that External ID application through its
custom `azureActiveDirectory` configuration. Static Web Apps aliases Microsoft
Entra providers to the `aad` route, so the website continues to use
`/.auth/login/aad`. External ID owns credential collection, password storage,
email verification, password reset, and social provider federation. Game Hub
never receives a user's password or a social provider credential.

This decision replaces the hosting baseline's preconfigured Microsoft Entra
provider when the later Azure configuration story is complete. It does not
change the existing Azure Front Door, Static Web Apps, or linked Azure
Container Apps topology.

## Why This Is the Current Azure Choice

Microsoft Entra External ID is Microsoft's current customer identity and access
management service. Its external tenant supports self-service customer
registration, email and password accounts, password reset, and Google and
Facebook identity providers in one user flow.

Azure Active Directory Business to Consumer (Azure AD B2C) is not selected.
Microsoft stopped selling Azure AD B2C to new customers on May 1, 2025 and
identifies Microsoft Entra External ID as the next-generation customer identity
and access management platform.

Azure Static Web Apps Standard already provides the repository's same-origin
authentication and linked-API boundary. Custom authentication supports a
Microsoft Entra registration, disables the unrelated preconfigured providers,
owns the `/.auth/*` session endpoints, and can read its client certificate from
Azure Key Vault through the Static Web App's managed identity.

## Runtime Boundaries

```text
Anonymous or signed-in browser
        |
        v
Azure Front Door Premium
        |
        v
Azure Static Web Apps
  |     |-- /.auth/login/aad --> Microsoft Entra External ID
  |     |                           |-- local email/password
  |     |                           |-- Google
  |     |                           `-- Facebook
  |     |-- /.auth/me --> platform session state
  |     `-- /api/* --> linked Azure Container Apps API
  |                         |
  |                         `-- resolve platform identity to Game Hub user ID
  `-- all other routes remain available to anonymous visitors
```

Anonymous browsing and game play remain the default. Authentication begins only
when a visitor chooses an account-dependent action or the sign-in affordance.
No route-wide redirect is introduced for public website or game routes.

Azure Static Web Apps owns the browser authentication session. The website
reads `/.auth/me` only to bootstrap display state and calls the same-origin
application session endpoint for the stable internal identity. Provider tokens,
credentials, and the raw platform identity are not application state.

The linked API is the only component that resolves an authenticated platform
principal. It accepts `x-ms-client-principal` only through the existing Static
Web Apps linked-backend trust boundary. It maps the tuple of Static Web Apps
provider name and Static Web Apps user ID to a generated, provider-independent
Game Hub user ID. Email address, display name, and provider label are not
identity keys.

The API validates that the principal uses the `aad` provider alias and contains
the built-in `authenticated` role before identity resolution. Missing,
malformed, wrong-provider, and unauthenticated principals fail closed without
creating a user record. The session response is either the shared anonymous
shape or the authenticated shape containing only the internal Game Hub user
ID; it never returns the platform subject, user details, claims, or provider
tokens.

The internal mapping is intentionally separate:

```text
(platform provider, platform subject) -> Game Hub user ID
```

This lets scores, profiles, ratings, votes, and community activity reference a
Game Hub user ID even if authentication configuration changes. It also prevents
an email match from silently linking or merging accounts.

The durable mapping uses a dedicated Azure Tables account:

- shared-key authentication is disabled and Microsoft Entra authentication is
  the default;
- the API's existing user-assigned runtime managed identity receives only
  Storage Table Data Contributor access;
- the table row key is a SHA-256 digest of the provider and platform subject,
  so the raw platform subject is not persisted;
- the entity contains only the generated Game Hub user ID and creation time;
  and
- conditional create plus conflict recovery makes concurrent first sign-ins
  resolve the same record.

The storage endpoint, table name, principal-header name, provider alias, role,
managed-identity client ID, and port are typed non-secret environment
configuration. No storage key or connection string is accepted.

## Shared Contract

`packages/auth-contract` is the framework-neutral TypeScript seam shared by the
website and API. `src/auth/contract.ts` re-exports it for the current website
call sites. The contract defines:

- the issue-required credential methods;
- the selected identity and session services;
- the custom provider name and non-secret same-origin endpoint paths;
- the trusted platform identity reference;
- the opaque internal Game Hub user ID; and
- anonymous and authenticated application session responses.

The browser-facing authenticated session exposes only the internal Game Hub
user ID. Session lifetime, refresh, revocation, and multi-device semantics
remain an explicit issue decision and are not encoded prematurely.

## Local Account Lifecycle

`config/authentication/external-id-local-account.json` is the reviewed desired
state for the local account flow. It selects External ID's
`EmailPassword-OAUTH` provider, permits self-service sign-up, collects the
verified email attribute, and enables email one-time passcodes for
self-service password reset. External ID verifies a new email address with a
one-time passcode before account creation and owns the password-reset
verification and replacement screens.

`yarn auth:configure` reconciles that state through Microsoft Graph. It creates
or updates the environment-specific sign-up and sign-in user flow, preserves
other identity providers added by later stories, links the non-secret customer
application ID, and enables the tenant email authentication method. The
protected `configure-external-id.yml` workflow authenticates to the external
tenant through OpenID Connect and accepts only protected environment variables
for the configuration identity, tenant ID, and customer application ID.

The `/account` website route provides separate registration/sign-in and
forgotten-password entry points. Both continue to the same Microsoft-hosted
user flow because External ID selects sign-in versus registration after the
email step and exposes **Forgot password** on its password screen. Game Hub
renders no password input and receives no password value.

## Social Provider Federation

`config/authentication/external-id-social-providers.json` declares Google and
Facebook as the two social providers for the same environment-specific customer
user flow. The committed desired state contains only provider types, display
names, environment-variable names, the deterministic Key Vault name template,
and Key Vault secret aliases. It contains no provider application credential.

The protected `configure-external-id.yml` workflow first authenticates to the
approved Azure subscription as the dedicated secure-configuration identity. It
resolves the Google and Facebook credentials directly from the environment Key
Vault, masks them immediately, and retains them only in the configuring shell
process. It then exchanges a fresh GitHub OpenID Connect assertion for the
external tenant configuration identity, creates or synchronizes both Microsoft
Graph `socialIdentityProvider` resources, and adds their returned provider IDs
to the existing local-account user flow. Repeated runs reapply the current Key
Vault values so provider credential rotation converges without committing or
publishing a credential.

The Google OAuth client ID and Facebook application ID are non-secret protected
environment variables. Provider secret values never enter source, committed
parameters, GitHub secrets, workflow outputs, artifacts, browser configuration,
or reconciliation results.

Frontend publication renders the tenant-scoped
`azureActiveDirectory` provider into the built Static Web Apps configuration.
The client ID is a non-secret Static Web Apps application setting. The client
credential is only an Azure Key Vault certificate reference, and the private
key never enters the repository, browser artifact, workflow variables, or
workflow output.

## Secret and Identity Handling

No secret value belongs in source, Bicep parameters, Bicep outputs, browser
bundles, logs, artifacts, Ralph memory, or pull-request text.

- GitHub deployment automation continues to use Microsoft Entra workload
  identity federation with OpenID Connect and the authorized subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- The Static Web Apps custom Microsoft Entra registration uses a client
  certificate stored in Azure Key Vault. The Static Web App's managed identity
  has only Key Vault Certificate User and reads the certificate through a Key
  Vault reference; no client secret is committed or exposed to the browser.
- Google and Facebook provider application credentials are supplied to
  Microsoft Entra External ID only by the protected configuration workflow. It
  retrieves them from Azure Key Vault with keyless workload identity, masks
  them, passes them only to the Microsoft Graph reconciliation process, and
  clears the shell variables afterward.
- Public identifiers such as tenant ID, application client ID, provider name,
  issuer URL, and redirect paths may be emitted as non-secret deployment
  configuration. Secret or private key material may not.
- The identity mapping account accepts only Microsoft Entra authorization. Its
  endpoint and table name are non-secret; account keys and connection strings
  are disabled and absent from application configuration.

The existing Azure Front Door web application firewall and authentication path
rate limit continue to cover `/.auth/*`. Later security work must also configure
the identity service's registration and credential-attack protections and
verify them with live evidence; this architecture decision alone does not claim
that protection is deployed.

## Deferred Issue Decisions

The current implementation still does not decide or implement:

- whether and how a person can link local and social credentials;
- session lifetime, refresh, revocation, or multi-device policy;
- minimum age, consent, privacy, or account deletion policy;
- live Google and Facebook application registration, credential seeding, and
  federation verification;
- custom hosted login, registration, verification, reset, error, or signed-out
  screens beyond the managed External ID experience; or
- live authentication or deployment verification.

Duplicate identities must fail safely until the linking decision is made.
Later work must not merge accounts solely because providers return the same
email address.

## Alternatives Not Selected

- **Azure AD B2C:** unavailable for purchase by new customers and superseded for
  new customer identity work by Microsoft Entra External ID.
- **Independent Static Web Apps Google, Facebook, and local providers:** Static
  Web Apps has no local credential store, and separate provider registrations
  would fragment identity and duplicate account handling instead of presenting
  one customer user flow.
- **Application-owned passwords or sessions:** would make Game Hub responsible
  for password processing and a custom browser session security boundary
  despite the selected managed services.
- **Direct browser authentication against the linked Container App:** would
  weaken the existing same-origin Static Web Apps trust boundary and require a
  second public API/authentication origin.

## Official References

Reviewed August 12, 2026:

- [Microsoft Entra External ID customer identity overview](https://learn.microsoft.com/en-us/entra/external-id/customers/overview-customers-ciam)
- [Create a customer sign-up and sign-in user flow](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-user-flow-sign-up-sign-in-customers)
- [Add Google as an identity provider](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-google-federation-customers)
- [Add Facebook as an identity provider](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-facebook-federation-customers)
- [Create an identity provider with Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/identitycontainer-post-identityproviders)
- [Update an identity provider with Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/identityproviderbase-update)
- [Enable self-service password reset](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-enable-password-reset-customers)
- [Create an authentication events flow with Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/identitycontainer-post-authenticationeventsflows)
- [Link an application to a user flow with Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/authenticationconditionsapplications-post-includeapplications)
- [Update the email authentication method with Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/emailauthenticationmethodconfiguration-update)
- [Azure Static Web Apps custom authentication](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-custom)
- [Azure Static Web Apps authentication and authorization](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization)
- [Azure Static Web Apps user information](https://learn.microsoft.com/en-us/azure/static-web-apps/user-information)
- [Link Azure Container Apps as a Static Web Apps API](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-container-apps)
- [Authorize Azure Tables access with Microsoft Entra ID](https://learn.microsoft.com/en-us/azure/storage/tables/authorize-access-azure-active-directory)
- [Azure Tables client library for JavaScript](https://learn.microsoft.com/en-us/javascript/api/overview/azure/data-tables-readme)
