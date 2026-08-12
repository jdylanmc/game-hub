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

The internal mapping is intentionally separate:

```text
(platform provider, platform subject) -> Game Hub user ID
```

This lets scores, profiles, ratings, votes, and community activity reference a
Game Hub user ID even if authentication configuration changes. It also prevents
an email match from silently linking or merging accounts.

## Shared Contract

`src/auth/contract.ts` is the framework-neutral TypeScript seam used by later
website and API stories. It defines:

- the issue-required credential methods;
- the selected identity and session services;
- the custom provider name and non-secret same-origin endpoint paths;
- the trusted platform identity reference;
- the opaque internal Game Hub user ID; and
- anonymous and authenticated application session responses.

The browser-facing authenticated session exposes only the internal Game Hub
user ID. Session lifetime, refresh, revocation, and multi-device semantics
remain an explicit issue decision and are not encoded prematurely.

## Secret and Identity Handling

No secret value belongs in source, Bicep parameters, Bicep outputs, browser
bundles, logs, artifacts, Ralph memory, or pull-request text.

- GitHub deployment automation continues to use Microsoft Entra workload
  identity federation with OpenID Connect and the authorized subscription
  `11213dbd-39fe-46ba-87db-5f5e8c449aed`.
- The Static Web Apps custom Microsoft Entra registration will use a client
  certificate stored in Azure Key Vault. The Static Web App's managed identity
  reads the certificate through a Key Vault reference; no client secret is
  committed or exposed to the browser.
- Google and Facebook require provider application credentials. Those
  credentials are stored by Microsoft Entra External ID and supplied only
  through an approved secure configuration path. Later automation must obtain
  them from Azure Key Vault using keyless workload identity and must mask and
  avoid retaining their values.
- Public identifiers such as tenant ID, application client ID, provider name,
  issuer URL, and redirect paths may be emitted as non-secret deployment
  configuration. Secret or private key material may not.

The existing Azure Front Door web application firewall and authentication path
rate limit continue to cover `/.auth/*`. Later security work must also configure
the identity service's registration and credential-attack protections and
verify them with live evidence; this architecture decision alone does not claim
that protection is deployed.

## Deferred Issue Decisions

The first bounded story intentionally does not decide or implement:

- whether and how a person can link local and social credentials;
- session lifetime, refresh, revocation, or multi-device policy;
- minimum age, consent, privacy, or account deletion policy;
- provider registrations, user-flow configuration, or Azure resource creation;
- login, registration, verification, reset, error, or signed-out user
  interfaces; or
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
- [Enable self-service password reset](https://learn.microsoft.com/en-us/entra/external-id/customers/how-to-enable-password-reset-customers)
- [Azure Static Web Apps custom authentication](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-custom)
- [Azure Static Web Apps authentication and authorization](https://learn.microsoft.com/en-us/azure/static-web-apps/authentication-authorization)
- [Azure Static Web Apps user information](https://learn.microsoft.com/en-us/azure/static-web-apps/user-information)
