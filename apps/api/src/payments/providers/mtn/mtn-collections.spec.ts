import assert from 'node:assert/strict';
import test from 'node:test';

import type { MtnMomoCollectionsConfig } from '@tteeka/config';

import { HttpMtnCollectionsClient } from './mtn-collections.client';
import {
  generateMtnReferenceId,
  isMtnReferenceId,
  MtnCollectionsClientError,
  type MtnRequestToPayInput,
} from './mtn-collections';

const CONFIG = {
  enabled: true,
  apiUser: '2f209631-07d4-4254-8d6a-bd0f1ef78538',
  apiKey: 'synthetic-api-key',
  subscriptionKey: 'synthetic-subscription-key',
  timeoutMs: 1000,
} as const satisfies MtnMomoCollectionsConfig;

const INPUT: MtnRequestToPayInput = {
  referenceId: '1077fbc2-9253-437f-883c-30e248bc635d',
  amount: '600',
  payerMsisdn: '46733123450',
  externalId: 'synthetic-transaction-1',
  payerMessage: 'Synthetic sandbox request',
  payeeNote: 'Synthetic sandbox note',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function token(): Response {
  return json({
    access_token: 'synthetic-access-token',
    token_type: 'access_token',
    expires_in: 3600,
  });
}

function requestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

void test('MTN reference identity is cryptographic UUID v4 and caller-stable', () => {
  const generated = generateMtnReferenceId();
  assert.equal(isMtnReferenceId(generated), true);
  assert.equal(isMtnReferenceId(INPUT.referenceId), true);
  assert.equal(isMtnReferenceId('0198a9f0-1000-7000-8000-000000000001'), false);
});

void test('RequestToPay validates stable reference, amount, MSISDN, and 160-character messages', async () => {
  const client = new HttpMtnCollectionsClient(CONFIG, {
    fetch: () => Promise.resolve(token()),
  });
  for (const input of [
    { ...INPUT, referenceId: 'not-a-uuid' },
    { ...INPUT, amount: '-1' },
    { ...INPUT, payerMsisdn: '+256712345678' },
    { ...INPUT, payerMessage: 'x'.repeat(161) },
    { ...INPUT, payeeNote: '' },
  ]) {
    await assert.rejects(client.requestToPay(input), TypeError);
  }
});

void test('token cache reuses valid tokens, refreshes near expiry, and coalesces concurrency', async () => {
  let now = 0;
  let calls = 0;
  const client = new HttpMtnCollectionsClient(CONFIG, {
    now: () => now,
    fetch: () => {
      calls += 1;
      return Promise.resolve(
        json({
          access_token: `synthetic-token-${calls}`,
          token_type: 'access_token',
          expires_in: 60,
        }),
      );
    },
  });

  const concurrent = await Promise.all([
    client.getAccessToken(),
    client.getAccessToken(),
    client.getAccessToken(),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(
    concurrent.map(({ accessToken }) => accessToken),
    ['synthetic-token-1', 'synthetic-token-1', 'synthetic-token-1'],
  );

  now = 29_000;
  assert.equal(
    (await client.getAccessToken()).accessToken,
    'synthetic-token-1',
  );
  now = 30_001;
  assert.equal(
    (await client.getAccessToken()).accessToken,
    'synthetic-token-2',
  );
  assert.equal(calls, 2);
});

for (const [description, rejection, code] of [
  ['timeout', new DOMException('synthetic timeout', 'TimeoutError'), 'TIMEOUT'],
  [
    'connection failure',
    new TypeError('synthetic reset'),
    'CONNECTION_FAILURE',
  ],
] as const) {
  void test(`RequestToPay ${description} is UNKNOWN with one POST and the same reference`, async () => {
    let postCalls = 0;
    const client = new HttpMtnCollectionsClient(CONFIG, {
      fetch: (input: string | URL | Request) => {
        if (requestUrl(input).endsWith('/collection/token/'))
          return Promise.resolve(token());
        postCalls += 1;
        return Promise.reject(rejection);
      },
    });

    const result = await client.requestToPay(INPUT);
    assert.equal(result.outcome, 'UNKNOWN');
    assert.equal(result.referenceId, INPUT.referenceId);
    assert.equal(result.error.code, code);
    assert.equal(postCalls, 1);
  });
}

void test('duplicate RequestToPay reference is specifically rejected without replacement', async () => {
  let postCalls = 0;
  const client = new HttpMtnCollectionsClient(CONFIG, {
    fetch: (input: string | URL | Request) => {
      if (requestUrl(input).endsWith('/collection/token/'))
        return Promise.resolve(token());
      postCalls += 1;
      return Promise.resolve(
        json(
          { code: 'RESOURCE_ALREADY_EXIST', message: 'Duplicate reference' },
          409,
        ),
      );
    },
  });

  const result = await client.requestToPay(INPUT);
  assert.equal(result.outcome, 'REJECTED');
  assert.equal(result.referenceId, INPUT.referenceId);
  assert.equal(result.error.code, 'DUPLICATE_REFERENCE');
  assert.equal(postCalls, 1);
});

void test('token and provider errors expose only bounded normalized fields, never secrets', async () => {
  const client = new HttpMtnCollectionsClient(CONFIG, {
    fetch: () =>
      Promise.resolve(
        json(
          {
            error: 'invalid_client',
            message: `${CONFIG.apiKey} ${CONFIG.subscriptionKey}`,
          },
          401,
        ),
      ),
  });

  await assert.rejects(client.getAccessToken(), (error: unknown) => {
    assert.ok(error instanceof MtnCollectionsClientError);
    const serialized = JSON.stringify(error);
    assert.doesNotMatch(serialized, new RegExp(CONFIG.apiKey));
    assert.doesNotMatch(serialized, new RegExp(CONFIG.subscriptionKey));
    assert.doesNotMatch(serialized, /authorization/i);
    assert.deepEqual(error.toJSON(), {
      code: 'AUTHENTICATION_FAILURE',
      message: 'MTN authentication failed.',
      httpStatus: 401,
      providerCode: 'invalid_client',
    });
    return true;
  });
});

for (const [description, rejection, code] of [
  ['timeout', new DOMException('synthetic timeout', 'TimeoutError'), 'TIMEOUT'],
  [
    'connection failure',
    new TypeError('synthetic reset'),
    'CONNECTION_FAILURE',
  ],
] as const) {
  void test(`token ${description} is normalized without retry`, async () => {
    let calls = 0;
    const client = new HttpMtnCollectionsClient(CONFIG, {
      fetch: () => {
        calls += 1;
        return Promise.reject(rejection);
      },
    });
    await assert.rejects(client.getAccessToken(), {
      name: 'MtnCollectionsClientError',
      code,
    });
    assert.equal(calls, 1);
  });
}

void test('malformed token and status payloads normalize without crashing', async () => {
  const malformedToken = new HttpMtnCollectionsClient(CONFIG, {
    fetch: () => Promise.resolve(new Response('{', { status: 200 })),
  });
  await assert.rejects(malformedToken.getAccessToken(), {
    name: 'MtnCollectionsClientError',
    code: 'UNEXPECTED_RESPONSE',
  });

  const malformedStatus = new HttpMtnCollectionsClient(CONFIG, {
    fetch: (input: string | URL | Request) =>
      requestUrl(input).endsWith('/collection/token/')
        ? Promise.resolve(token())
        : Promise.resolve(new Response('{', { status: 200 })),
  });
  assert.deepEqual(
    await malformedStatus.getRequestToPayStatus(INPUT.referenceId),
    {
      outcome: 'TECHNICAL_FAILURE',
      referenceId: INPUT.referenceId,
      error: {
        code: 'UNEXPECTED_RESPONSE',
        message: 'MTN returned an unexpected response.',
        httpStatus: 200,
        providerCode: null,
      },
    },
  );
});
