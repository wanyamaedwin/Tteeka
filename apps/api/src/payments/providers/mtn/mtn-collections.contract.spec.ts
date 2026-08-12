import assert from 'node:assert/strict';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import test from 'node:test';

import type { MtnMomoCollectionsConfig } from '@tteeka/config';

import { HttpMtnCollectionsClient } from './mtn-collections.client';
import type { MtnRequestToPayInput } from './mtn-collections';

const API_USER = '2f209631-07d4-4254-8d6a-bd0f1ef78538';
const CONFIG = {
  enabled: true,
  apiUser: API_USER,
  apiKey: 'synthetic-api-key',
  subscriptionKey: 'synthetic-subscription-key',
  callbackUrl: 'https://sandbox.example.test/mtn-callback',
  timeoutMs: 1000,
} as const satisfies MtnMomoCollectionsConfig;

const INPUT: MtnRequestToPayInput = {
  referenceId: '1077fbc2-9253-437f-883c-30e248bc635d',
  amount: '600.00',
  payerMsisdn: '46733123450',
  externalId: 'synthetic-transaction-1',
  payerMessage: 'Synthetic sandbox request',
  payeeNote: 'Synthetic sandbox note',
};

type Handler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;

async function withServer<T>(
  handler: Handler,
  work: (baseUrl: string) => Promise<T>,
) {
  const server = createServer((request, response) => {
    void Promise.resolve(handler(request, response)).catch((error: unknown) => {
      response.destroy(error instanceof Error ? error : undefined);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');
  try {
    return await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      );
    });
  }
}

async function body(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request)
    chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(value));
}

function token(response: ServerResponse): void {
  sendJson(response, 200, {
    access_token: 'synthetic-access-token',
    token_type: 'access_token',
    expires_in: 3600,
  });
}

void test('local contract server verifies exact token and RequestToPay wire contract', async () => {
  let tokenCalls = 0;
  let requestCalls = 0;
  await withServer(
    async (request, response) => {
      if (request.url === '/collection/token/') {
        tokenCalls += 1;
        assert.equal(request.method, 'POST');
        assert.equal(
          request.headers.authorization,
          `Basic ${Buffer.from(`${API_USER}:${CONFIG.apiKey}`).toString('base64')}`,
        );
        assert.equal(
          request.headers['ocp-apim-subscription-key'],
          CONFIG.subscriptionKey,
        );
        assert.equal(await body(request), '');
        token(response);
        return;
      }
      requestCalls += 1;
      assert.equal(request.url, '/collection/v1_0/requesttopay');
      assert.equal(request.method, 'POST');
      assert.equal(
        request.headers.authorization,
        'Bearer synthetic-access-token',
      );
      assert.equal(
        request.headers['ocp-apim-subscription-key'],
        CONFIG.subscriptionKey,
      );
      assert.equal(request.headers['x-reference-id'], INPUT.referenceId);
      assert.equal(request.headers['x-target-environment'], 'sandbox');
      assert.equal(request.headers['x-callback-url'], CONFIG.callbackUrl);
      assert.match(request.headers['content-type'] ?? '', /^application\/json/);
      assert.deepEqual(JSON.parse(await body(request)), {
        amount: '600.00',
        currency: 'EUR',
        externalId: INPUT.externalId,
        payer: { partyIdType: 'MSISDN', partyId: INPUT.payerMsisdn },
        payerMessage: INPUT.payerMessage,
        payeeNote: INPUT.payeeNote,
      });
      response.writeHead(202);
      response.end();
    },
    async (baseUrl) => {
      const client = new HttpMtnCollectionsClient(CONFIG, { baseUrl });
      assert.deepEqual(await client.requestToPay(INPUT), {
        outcome: 'ACCEPTED',
        referenceId: INPUT.referenceId,
      });
    },
  );
  assert.equal(tokenCalls, 1);
  assert.equal(requestCalls, 1);
});

for (const [providerStatus, outcome] of [
  ['PENDING', 'PENDING'],
  ['SUCCESSFUL', 'SUCCESSFUL'],
  ['FAILED', 'FAILED'],
] as const) {
  void test(`status ${providerStatus} maps from the official response vocabulary`, async () => {
    await withServer(
      (request, response) => {
        if (request.url === '/collection/token/') return token(response);
        assert.equal(
          request.url,
          `/collection/v1_0/requesttopay/${INPUT.referenceId}`,
        );
        assert.equal(request.method, 'GET');
        assert.equal(
          request.headers.authorization,
          'Bearer synthetic-access-token',
        );
        assert.equal(request.headers['x-target-environment'], 'sandbox');
        assert.equal(
          request.headers['ocp-apim-subscription-key'],
          CONFIG.subscriptionKey,
        );
        sendJson(response, 200, {
          amount: INPUT.amount,
          currency: 'EUR',
          financialTransactionId: 'financial-transaction-1',
          externalId: INPUT.externalId,
          status: providerStatus,
          ...(providerStatus === 'FAILED'
            ? {
                reason: {
                  code: 'PAYER_NOT_FOUND',
                  message: 'Synthetic failure',
                },
              }
            : {}),
        });
      },
      async (baseUrl) => {
        const result = await new HttpMtnCollectionsClient(CONFIG, {
          baseUrl,
        }).getRequestToPayStatus(INPUT.referenceId);
        assert.equal(result.outcome, outcome);
        if (
          result.outcome === 'PENDING' ||
          result.outcome === 'SUCCESSFUL' ||
          result.outcome === 'FAILED'
        ) {
          assert.equal(result.providerStatus, providerStatus);
          assert.equal(
            result.financialTransactionId,
            'financial-transaction-1',
          );
          assert.equal(
            result.reasonCode,
            providerStatus === 'FAILED' ? 'PAYER_NOT_FOUND' : null,
          );
        }
      },
    );
  });
}

for (const [status, bodyValue, expected] of [
  [401, { error: 'invalid_client' }, 'AUTHENTICATION_FAILURE'],
  [403, { code: 'NOT_ALLOWED' }, 'AUTHORIZATION_FAILURE'],
] as const) {
  void test(`token HTTP ${status} is normalized without secret exposure`, async () => {
    await withServer(
      (_request, response) => {
        sendJson(response, status, {
          ...bodyValue,
          message: `${CONFIG.apiKey}:${CONFIG.subscriptionKey}`,
        });
      },
      async (baseUrl) => {
        const client = new HttpMtnCollectionsClient(CONFIG, { baseUrl });
        await assert.rejects(client.getAccessToken(), (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal((error as { code?: string }).code, expected);
          const serialized = JSON.stringify(error);
          assert.doesNotMatch(serialized, new RegExp(CONFIG.apiKey));
          assert.doesNotMatch(serialized, new RegExp(CONFIG.subscriptionKey));
          return true;
        });
      },
    );
  });
}

void test('status 404 and provider 503 are normalized independently from Payment domain', async () => {
  for (const [status, bodyValue, expectedOutcome, expectedCode] of [
    [404, { code: 'RESOURCE_NOT_FOUND' }, 'NOT_FOUND', 'NOT_FOUND'],
    [
      503,
      { code: 'SERVICE_UNAVAILABLE' },
      'TECHNICAL_FAILURE',
      'PROVIDER_UNAVAILABLE',
    ],
  ] as const) {
    await withServer(
      (request, response) => {
        if (request.url === '/collection/token/') return token(response);
        sendJson(response, status, bodyValue);
      },
      async (baseUrl) => {
        const result = await new HttpMtnCollectionsClient(CONFIG, {
          baseUrl,
        }).getRequestToPayStatus(INPUT.referenceId);
        assert.equal(result.outcome, expectedOutcome);
        if (
          result.outcome === 'NOT_FOUND' ||
          result.outcome === 'TECHNICAL_FAILURE'
        )
          assert.equal(result.error.code, expectedCode);
      },
    );
  }
});

void test('connection reset after RequestToPay dispatch remains UNKNOWN and is never retried', async () => {
  let posts = 0;
  await withServer(
    (request, response) => {
      if (request.url === '/collection/token/') return token(response);
      posts += 1;
      request.socket.destroy();
    },
    async (baseUrl) => {
      const result = await new HttpMtnCollectionsClient(CONFIG, {
        baseUrl,
      }).requestToPay(INPUT);
      assert.equal(result.outcome, 'UNKNOWN');
      assert.equal(result.referenceId, INPUT.referenceId);
      assert.equal(result.error.code, 'CONNECTION_FAILURE');
    },
  );
  assert.equal(posts, 1);
});
