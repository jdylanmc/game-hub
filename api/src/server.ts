import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { ApiConfiguration } from './config.js';
import type { UserIdentityStore } from './identity-store.js';
import { handleApiRequest, type ApiResponse } from './session-handler.js';

export function createGameHubApiServer(configuration: ApiConfiguration, identityStore: UserIdentityStore): Server {
  return createServer((request, response) => {
    void (async () => {
      try {
        const result = await handleApiRequest(
          {
            headers: normalizeHeaders(request.headers),
            method: request.method ?? '',
            pathname: new URL(request.url ?? '/', 'http://localhost').pathname,
          },
          configuration,
          identityStore,
        );
        writeResponse(response, result);
      } catch {
        writeResponse(response, {
          body: { state: 'anonymous' },
          headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
          },
          status: 503,
        });
      }
    })();
  });
}

function normalizeHeaders(headers: IncomingHttpHeaders): Readonly<Record<string, string | undefined>> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, Array.isArray(value) ? value[0] : value]),
  );
}

function writeResponse(response: ServerResponse<IncomingMessage>, result: ApiResponse): void {
  response.writeHead(result.status, result.headers);
  response.end(JSON.stringify(result.body));
}
