const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TABLE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]{2,62}$/;

export interface ApiConfiguration {
  authentication: {
    principalHeader: 'x-ms-client-principal';
    provider: 'aad';
    requiredRole: 'authenticated';
  };
  identityStorage: {
    endpoint: string;
    managedIdentityClientId: string;
    tableName: string;
  };
  port: number;
}

export function loadApiConfiguration(environment: NodeJS.ProcessEnv = process.env): ApiConfiguration {
  const principalHeader = requireExact(environment, 'GAME_HUB_AUTH_PRINCIPAL_HEADER', 'x-ms-client-principal');
  const provider = requireExact(environment, 'GAME_HUB_AUTH_PROVIDER', 'aad');
  const requiredRole = requireExact(environment, 'GAME_HUB_AUTH_REQUIRED_ROLE', 'authenticated');
  const endpoint = requireTableEndpoint(environment.GAME_HUB_IDENTITY_STORAGE_ENDPOINT);
  const tableName = requireTableName(environment.GAME_HUB_IDENTITY_TABLE_NAME);
  const managedIdentityClientId = requireManagedIdentityClientId(environment.AZURE_CLIENT_ID);
  const port = parsePort(environment.PORT);

  return {
    authentication: {
      principalHeader,
      provider,
      requiredRole,
    },
    identityStorage: {
      endpoint,
      managedIdentityClientId,
      tableName,
    },
    port,
  };
}

function requireExact<const Expected extends string>(
  environment: NodeJS.ProcessEnv,
  name: string,
  expected: Expected,
): Expected {
  if (environment[name] !== expected) {
    throw new Error(`${name} must be configured as ${expected}.`);
  }

  return expected;
}

function requireTableEndpoint(value: string | undefined): string {
  if (!value) {
    throw new Error('GAME_HUB_IDENTITY_STORAGE_ENDPOINT is required.');
  }

  const endpoint = new URL(value);
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.search !== '' ||
    endpoint.hash !== '' ||
    endpoint.pathname !== '/' ||
    !endpoint.hostname.endsWith('.table.core.windows.net')
  ) {
    throw new Error('GAME_HUB_IDENTITY_STORAGE_ENDPOINT must be an Azure Tables HTTPS endpoint.');
  }

  return endpoint.toString();
}

function requireTableName(value: string | undefined): string {
  if (!value || !TABLE_NAME_PATTERN.test(value)) {
    throw new Error('GAME_HUB_IDENTITY_TABLE_NAME must be a valid Azure table name.');
  }

  return value;
}

function requireManagedIdentityClientId(value: string | undefined): string {
  if (!value || !UUID_PATTERN.test(value)) {
    throw new Error('AZURE_CLIENT_ID must identify the API runtime managed identity.');
  }

  return value;
}

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 8080 : Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer from 1 through 65535.');
  }

  return port;
}
