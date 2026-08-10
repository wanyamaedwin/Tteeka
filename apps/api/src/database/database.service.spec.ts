import assert from 'node:assert/strict';
import test from 'node:test';

import type { AppConfig } from '@tteeka/config';
import type { PrismaClientFactory, TteekaPrismaClient } from '@tteeka/database';

import { DatabaseService } from './database.service';

const CONFIG: AppConfig = Object.freeze({
  nodeEnv: 'test',
  apiPort: 3000,
  databaseUrl: 'postgresql://tteeka:test@127.0.0.1:5432/tteeka',
  redisUrl: 'redis://127.0.0.1:6379',
  infraHealthTimeoutMs: 2000,
  sessionTtlSeconds: 43_200,
  sessionTouchIntervalSeconds: 300,
});

void test('database service constructs from validated AppConfig', () => {
  let receivedUrl: string | undefined;
  const client = {
    $disconnect: () => Promise.resolve(),
  } as TteekaPrismaClient;
  const factory: PrismaClientFactory = (options) => {
    receivedUrl = options.databaseUrl;
    return client;
  };

  const service = new DatabaseService(CONFIG, factory);

  assert.equal(receivedUrl, CONFIG.databaseUrl);
  assert.equal(service.client, client);
});

void test('database service retains one process-scoped client instance', () => {
  let constructionCount = 0;
  const client = {
    $disconnect: () => Promise.resolve(),
  } as TteekaPrismaClient;
  const factory: PrismaClientFactory = () => {
    constructionCount += 1;
    return client;
  };

  const service = new DatabaseService(CONFIG, factory);

  assert.equal(service.client, service.client);
  assert.equal(constructionCount, 1);
});

void test('database service disconnects its client during shutdown', async () => {
  let disconnected = false;
  const client = {
    $disconnect: () => {
      disconnected = true;
      return Promise.resolve();
    },
  } as TteekaPrismaClient;
  const service = new DatabaseService(CONFIG, () => client);

  await service.onApplicationShutdown();

  assert.equal(disconnected, true);
});
