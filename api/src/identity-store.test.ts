import type { PlatformIdentityReference } from '@game-hub/auth-contract';
import { describe, expect, it } from 'vitest';
import { createIdentityRowKey, TableUserIdentityStore } from './identity-store.js';

interface TestEntity {
  createdAtUtc: string;
  gameHubUserId: string;
  partitionKey: string;
  rowKey: string;
}

function statusError(statusCode: number): Error & { statusCode: number } {
  return Object.assign(new Error(`Test status ${statusCode}`), { statusCode });
}

function createMemoryTable() {
  const entities = new Map<string, TestEntity>();

  return {
    entities,
    table: {
      create: (entity: TestEntity) => {
        const key = `${entity.partitionKey}/${entity.rowKey}`;
        if (entities.has(key)) return Promise.reject(statusError(409));
        entities.set(key, entity);
        return Promise.resolve();
      },
      get: (partitionKey: string, rowKey: string) => {
        const entity = entities.get(`${partitionKey}/${rowKey}`);
        return entity ? Promise.resolve(entity) : Promise.reject(statusError(404));
      },
    },
  };
}

const identity: PlatformIdentityReference = {
  provider: 'aad',
  subject: 'external-platform-subject',
};

describe('table-backed internal identity resolution', () => {
  it('returns the same provider-independent Game Hub user ID repeatedly', async () => {
    const { entities, table } = createMemoryTable();
    const store = new TableUserIdentityStore(table, {
      createUserId: () => 'usr_11111111-2222-4333-8444-555555555555',
      now: () => new Date('2026-08-12T08:00:00.000Z'),
    });

    await expect(store.getOrCreate(identity)).resolves.toBe('usr_11111111-2222-4333-8444-555555555555');
    await expect(store.getOrCreate(identity)).resolves.toBe('usr_11111111-2222-4333-8444-555555555555');

    expect(entities.size).toBe(1);
    expect([...entities.values()][0]).toMatchObject({
      createdAtUtc: '2026-08-12T08:00:00.000Z',
      gameHubUserId: 'usr_11111111-2222-4333-8444-555555555555',
    });
  });

  it('stores a one-way identity key instead of the platform subject', async () => {
    const { entities, table } = createMemoryTable();
    const store = new TableUserIdentityStore(table, {
      createUserId: () => 'usr_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    });

    await store.getOrCreate(identity);

    const entity = [...entities.values()][0];
    expect(entity?.rowKey).toBe(createIdentityRowKey(identity));
    expect(JSON.stringify(entity)).not.toContain(identity.subject);
    expect(entity?.gameHubUserId).not.toBe(identity.subject);
  });

  it('returns the winner when concurrent creation reports a conflict', async () => {
    const rowKey = createIdentityRowKey(identity);
    const store = new TableUserIdentityStore(
      {
        create: () => Promise.reject(statusError(409)),
        get: (() => {
          let call = 0;
          return () => {
            call += 1;
            return call === 1
              ? Promise.reject(statusError(404))
              : Promise.resolve({
                  createdAtUtc: '2026-08-12T08:00:00.000Z',
                  gameHubUserId: 'usr_99999999-8888-4777-8666-555555555555',
                  partitionKey: 'platform-identity-v1',
                  rowKey,
                });
          };
        })(),
      },
      {
        createUserId: () => 'usr_11111111-2222-4333-8444-555555555555',
      },
    );

    await expect(store.getOrCreate(identity)).resolves.toBe('usr_99999999-8888-4777-8666-555555555555');
  });

  it('does not merge distinct platform subjects', () => {
    expect(createIdentityRowKey(identity)).not.toBe(
      createIdentityRowKey({ provider: 'aad', subject: 'another-subject' }),
    );
  });
});
