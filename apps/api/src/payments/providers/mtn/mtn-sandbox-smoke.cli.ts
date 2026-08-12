import { loadMtnMomoCollectionsConfig } from '@tteeka/config';

import { HttpMtnCollectionsClient } from './mtn-collections.client';
import {
  generateMtnReferenceId,
  MtnCollectionsClientError,
} from './mtn-collections';

function required(value: string | undefined, label: string): string {
  if (value === undefined || value.length === 0) {
    throw new TypeError(`${label} is required.`);
  }
  return value;
}

function usage(): never {
  throw new TypeError(
    'Usage: token | status <referenceId> | request-to-pay <sandboxMsisdn> <amount> <externalId> <payerMessage> <payeeNote> [referenceId]',
  );
}

function argumentOrEnvironment(
  argumentIndex: number,
  environmentName: string,
  label: string,
): string {
  return required(
    process.argv[argumentIndex] ?? process.env[environmentName],
    label,
  );
}

async function main(): Promise<void> {
  const config = loadMtnMomoCollectionsConfig(process.env);
  if (!config.enabled) {
    throw new TypeError(
      'MTN Collections is disabled. Explicitly enable validated sandbox configuration first.',
    );
  }

  const client = new HttpMtnCollectionsClient(config);
  const operation = process.argv[2];

  if (operation === 'token') {
    const token = await client.getAccessToken();
    console.log(
      JSON.stringify({
        outcome: 'TOKEN_OBTAINED',
        tokenType: token.tokenType,
        expiresInSeconds: token.expiresInSeconds,
      }),
    );
    return;
  }

  if (operation === 'status') {
    const referenceId = required(process.argv[3], 'referenceId');
    console.log(
      JSON.stringify(await client.getRequestToPayStatus(referenceId)),
    );
    return;
  }

  if (operation === 'request-to-pay') {
    const referenceId =
      process.argv[8] ??
      process.env.MTN_MOMO_SANDBOX_REFERENCE_ID ??
      generateMtnReferenceId();
    const result = await client.requestToPay({
      referenceId,
      payerMsisdn: argumentOrEnvironment(
        3,
        'MTN_MOMO_SANDBOX_MSISDN',
        'sandboxMsisdn',
      ),
      amount: argumentOrEnvironment(4, 'MTN_MOMO_SANDBOX_AMOUNT', 'amount'),
      externalId: argumentOrEnvironment(
        5,
        'MTN_MOMO_SANDBOX_EXTERNAL_ID',
        'externalId',
      ),
      payerMessage: argumentOrEnvironment(
        6,
        'MTN_MOMO_SANDBOX_PAYER_MESSAGE',
        'payerMessage',
      ),
      payeeNote: argumentOrEnvironment(
        7,
        'MTN_MOMO_SANDBOX_PAYEE_NOTE',
        'payeeNote',
      ),
    });
    console.log(JSON.stringify(result));
    return;
  }

  usage();
}

void main().catch((error: unknown) => {
  if (error instanceof MtnCollectionsClientError) {
    console.error(JSON.stringify(error.toJSON()));
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('MTN sandbox smoke failed.');
  }
  process.exitCode = 1;
});
