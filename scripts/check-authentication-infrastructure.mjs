import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadAuthenticationInfrastructure(root = rootDirectory) {
  return {
    authenticationModule: readFileSync(path.join(root, 'infra/modules/authentication-readiness.bicep'), 'utf8'),
    environmentParameters: Object.fromEntries(
      ['dev', 'prod'].map((environment) => [
        environment,
        readFileSync(path.join(root, `infra/environments/${environment}.bicepparam`), 'utf8'),
      ]),
    ),
    mainTemplate: readFileSync(path.join(root, 'infra/main.bicep'), 'utf8'),
    staticWebAppModule: readFileSync(path.join(root, 'infra/modules/static-web-app.bicep'), 'utf8'),
    staticWebAppConfiguration: JSON.parse(readFileSync(path.join(root, 'public/staticwebapp.config.json'), 'utf8')),
  };
}

export function validateAuthenticationInfrastructure({
  authenticationModule,
  environmentParameters,
  mainTemplate,
  staticWebAppModule,
  staticWebAppConfiguration,
}) {
  const violations = [];

  requireText(
    staticWebAppModule,
    "type: 'SystemAssigned'",
    'The Static Web App must keep a system-assigned managed identity.',
    violations,
  );
  requireText(
    staticWebAppModule,
    'output managedIdentityPrincipalId string',
    'The frontend managed identity principal must be exposed.',
    violations,
  );

  for (const [needle, message] of [
    ['Microsoft.Web/staticSites/linkedBackends@2025-03-01', 'The production API must use a linked backend.'],
    ["kind: 'containerapp'", 'The linked backend must target Azure Container Apps.'],
    ['backendResourceId: apiResourceId', 'The link must use the declared API resource identifier.'],
    ["protocol: 'OpenID Connect'", 'The frontend authentication protocol must be OpenID Connect.'],
    [
      "providerRegistration: 'Azure-managed preconfigured provider'",
      'Authentication must use the keyless Azure-managed provider.',
    ],
    ['clientCredentialRequired: false', 'Authentication must not require a client credential.'],
    ['secretValuesAccepted: false', 'The authentication contract must reject secret values.'],
    ["principalHeaderName = 'x-ms-client-principal'", 'The API principal header boundary must be explicit.'],
    [
      "apiIngress: 'Azure Static Web Apps linked backend'",
      'The linked backend must remain the API ingress trust boundary.',
    ],
  ]) {
    requireText(authenticationModule, needle, message, violations);
  }

  for (const [environment, parameters] of Object.entries(environmentParameters)) {
    for (const [needle, setting] of [
      ["name: 'GAME_HUB_AUTH_PROVIDER'\n    value: 'azureActiveDirectory'", 'provider'],
      ["name: 'GAME_HUB_AUTH_PRINCIPAL_HEADER'\n    value: 'x-ms-client-principal'", 'principal header'],
      ["name: 'GAME_HUB_AUTH_REQUIRED_ROLE'\n    value: 'authenticated'", 'required role'],
    ]) {
      requireText(
        parameters,
        needle,
        `The ${environment} API ${setting} placeholder must match the authentication contract.`,
        violations,
      );
    }
  }

  for (const [needle, message] of [
    [
      "module authenticationReadiness './modules/authentication-readiness.bicep'",
      'The entry point must compose the authentication module.',
    ],
    ['apiResourceId: containerAppApi.outputs.appId', 'Authentication must link the existing Container App.'],
    ['staticWebAppName: staticWebApp.outputs.name', 'Authentication must retain the existing Static Web App.'],
    [
      'output authenticationConfiguration object',
      'The entry point must expose non-secret authentication configuration.',
    ],
    ['output authenticatedApiEndpoint string', 'The entry point must expose the stable authenticated API endpoint.'],
  ]) {
    requireText(mainTemplate, needle, message, violations);
  }

  const routes = Array.isArray(staticWebAppConfiguration.routes) ? staticWebAppConfiguration.routes : [];
  requireRoute(
    routes,
    (route) => route.route === '/login' && route.redirect === '/.auth/login/aad',
    'The friendly login route must use the Microsoft Entra provider.',
    violations,
  );
  requireRoute(
    routes,
    (route) => route.route === '/logout' && route.redirect === '/.auth/logout',
    'The friendly logout route must use Static Web Apps authentication.',
    violations,
  );
  requireRoute(
    routes,
    (route) => route.route === '/.auth/login/github' && route.statusCode === 404,
    'The unused preconfigured GitHub provider must be blocked.',
    violations,
  );
  requireRoute(
    routes,
    (route) =>
      route.route === '/api/*' &&
      Array.isArray(route.allowedRoles) &&
      route.allowedRoles.length === 1 &&
      route.allowedRoles[0] === 'authenticated',
    'The same-origin API route must require the authenticated role.',
    violations,
  );

  const authenticationSources = `${authenticationModule}\n${staticWebAppModule}`;
  for (const forbidden of [
    /clientSecret/i,
    /connectionString/i,
    /sharedAccessSignature/i,
    /accountKey/i,
    /repositoryToken/i,
  ]) {
    if (forbidden.test(authenticationSources)) {
      violations.push(`Authentication infrastructure contains forbidden credential field: ${forbidden.source}.`);
    }
  }

  return violations;
}

function requireText(source, needle, message, violations) {
  if (!source.includes(needle)) violations.push(message);
}

function requireRoute(routes, predicate, message, violations) {
  if (!routes.some(predicate)) violations.push(message);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const violations = validateAuthenticationInfrastructure(loadAuthenticationInfrastructure());
  if (violations.length > 0) {
    throw new Error(`Authentication infrastructure policy failed:\n- ${violations.join('\n- ')}`);
  }
  console.log('Authentication infrastructure policy passed.');
}
