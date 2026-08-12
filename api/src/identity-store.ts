import { createHash, randomUUID } from 'node:crypto';
import { TableClient } from '@azure/data-tables';
import { DefaultAzureCredential } from '@azure/identity';
import type { GameHubUserId, PlatformIdentityReference } from '@game-hub/auth-contract';
import type { ApiConfiguration } from './config.js';

const IDENTITY_PARTITION_KEY = 'platform-identity-v1';
const GAME_HUB_USER_ID_PATTERN = /^usr_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredUserIdentity {
  createdAtUtc: string;
  gameHubUserId: string;
}

interface StoredUserIdentityEntity extends StoredUserIdentity {
  partitionKey: string;
  rowKey: string;
}

interface IdentityTable {
  create(entity: StoredUserIdentityEntity): Promise<void>;
  get(partitionKey: string, rowKey: string): Promise<StoredUserIdentityEntity>;
}

export interface UserIdentityStore {
  getOrCreate(identity: PlatformIdentityReference): Promise<GameHubUserId>;
}

interface TableUserIdentityStoreOptions {
  createUserId?: () => string;
  now?: () => Date;
}

export class TableUserIdentityStore implements UserIdentityStore {
  readonly #createUserId: () => string;
  readonly #now: () => Date;
  readonly #table: IdentityTable;

  constructor(table: IdentityTable, options: TableUserIdentityStoreOptions = {}) {
    this.#table = table;
    this.#createUserId = options.createUserId ?? (() => `usr_${randomUUID()}`);
    this.#now = options.now ?? (() => new Date());
  }

  async getOrCreate(identity: PlatformIdentityReference): Promise<GameHubUserId> {
    const rowKey = createIdentityRowKey(identity);

    try {
      return readGameHubUserId(await this.#table.get(IDENTITY_PARTITION_KEY, rowKey));
    } catch (error) {
      if (!hasStatusCode(error, 404)) throw error;
    }

    const gameHubUserId = this.#createUserId();
    if (!GAME_HUB_USER_ID_PATTERN.test(gameHubUserId)) {
      throw new Error('The generated Game Hub user ID is invalid.');
    }

    const entity: StoredUserIdentityEntity = {
      createdAtUtc: this.#now().toISOString(),
      gameHubUserId,
      partitionKey: IDENTITY_PARTITION_KEY,
      rowKey,
    };

    try {
      await this.#table.create(entity);
      return gameHubUserId as GameHubUserId;
    } catch (error) {
      if (!hasStatusCode(error, 409)) throw error;
      return readGameHubUserId(await this.#table.get(IDENTITY_PARTITION_KEY, rowKey));
    }
  }
}

export function createTableUserIdentityStore(
  configuration: ApiConfiguration['identityStorage'],
): TableUserIdentityStore {
  const credential = new DefaultAzureCredential({
    managedIdentityClientId: configuration.managedIdentityClientId,
  });
  const client = new TableClient(configuration.endpoint, configuration.tableName, credential);

  return new TableUserIdentityStore({
    create: async (entity) => {
      await client.createEntity<StoredUserIdentity>(entity);
    },
    get: async (partitionKey, rowKey) => {
      const entity = await client.getEntity<StoredUserIdentity>(partitionKey, rowKey);
      if (
        entity.partitionKey !== partitionKey ||
        entity.rowKey !== rowKey ||
        typeof entity.createdAtUtc !== 'string' ||
        typeof entity.gameHubUserId !== 'string'
      ) {
        throw new Error('The stored identity entity is invalid.');
      }

      return {
        createdAtUtc: entity.createdAtUtc,
        gameHubUserId: entity.gameHubUserId,
        partitionKey,
        rowKey,
      };
    },
  });
}

export function createIdentityRowKey(identity: PlatformIdentityReference): string {
  return createHash('sha256').update(identity.provider).update('\0').update(identity.subject).digest('hex');
}

function readGameHubUserId(entity: StoredUserIdentityEntity): GameHubUserId {
  if (!GAME_HUB_USER_ID_PATTERN.test(entity.gameHubUserId)) {
    throw new Error('The stored Game Hub user ID is invalid.');
  }

  return entity.gameHubUserId as GameHubUserId;
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === statusCode;
}
