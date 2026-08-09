import assert from 'node:assert/strict';
import test from 'node:test';

import { HealthService } from './health.service';
import type { InfrastructureHealthProbe } from './health.types';

function probe(status: 'up' | 'down'): InfrastructureHealthProbe {
  return {
    check: () =>
      status === 'up'
        ? Promise.resolve()
        : Promise.reject(new Error('probe unavailable')),
  };
}

void test('liveness is healthy independently of PostgreSQL state', () => {
  const health = new HealthService(probe('down'), probe('up'));

  assert.equal(health.getLiveness().status, 'ok');
});

void test('liveness is healthy independently of Redis state', () => {
  const health = new HealthService(probe('up'), probe('down'));

  assert.equal(health.getLiveness().status, 'ok');
});

void test('readiness is ready when both dependencies are healthy', async () => {
  const response = await new HealthService(
    probe('up'),
    probe('up'),
  ).getReadiness();

  assert.equal(response.status, 'ready');
  assert.equal(response.checks.postgres.status, 'up');
  assert.equal(response.checks.redis.status, 'up');
});

void test('readiness is not ready when PostgreSQL fails', async () => {
  const response = await new HealthService(
    probe('down'),
    probe('up'),
  ).getReadiness();

  assert.equal(response.status, 'not_ready');
  assert.equal(response.checks.postgres.status, 'down');
  assert.equal(response.checks.redis.status, 'up');
});

void test('readiness is not ready when Redis fails', async () => {
  const response = await new HealthService(
    probe('up'),
    probe('down'),
  ).getReadiness();

  assert.equal(response.status, 'not_ready');
  assert.equal(response.checks.postgres.status, 'up');
  assert.equal(response.checks.redis.status, 'down');
});

void test('readiness is not ready when both dependencies fail', async () => {
  const response = await new HealthService(
    probe('down'),
    probe('down'),
  ).getReadiness();

  assert.equal(response.status, 'not_ready');
  assert.equal(response.checks.postgres.status, 'down');
  assert.equal(response.checks.redis.status, 'down');
});

void test('readiness response does not expose credentials', async () => {
  const response = await new HealthService(
    probe('down'),
    probe('down'),
  ).getReadiness();
  const serialized = JSON.stringify(response);

  assert.doesNotMatch(serialized, /password|postgresql:\/\/|redis:\/\//i);
});
