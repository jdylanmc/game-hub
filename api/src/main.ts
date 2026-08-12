import { loadApiConfiguration } from './config.js';
import { createTableUserIdentityStore } from './identity-store.js';
import { createGameHubApiServer } from './server.js';

const configuration = loadApiConfiguration();
const identityStore = createTableUserIdentityStore(configuration.identityStorage);
const server = createGameHubApiServer(configuration, identityStore);

server.listen(configuration.port, '0.0.0.0');

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exitCode = 0;
    });
  });
}
