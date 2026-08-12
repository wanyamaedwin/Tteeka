import type { MtnMomoCollectionsConfig } from '@tteeka/config';

import {
  MTN_MOMO_SANDBOX_BASE_URL,
  MTN_MOMO_SANDBOX_CURRENCY,
  MTN_MOMO_SANDBOX_TARGET_ENVIRONMENT,
  MtnCollectionsClientError,
  isMtnReferenceId,
  type MtnAccessTokenResult,
  type MtnCollectionsClient,
  type MtnCollectionsErrorCode,
  type MtnCollectionsFailure,
  type MtnRequestToPayInput,
  type MtnRequestToPayStatusResult,
  type MtnRequestToPaySubmissionResult,
} from './mtn-collections';

type EnabledMtnConfig = Extract<MtnMomoCollectionsConfig, { enabled: true }>;
type Fetch = typeof globalThis.fetch;

interface MtnCollectionsClientOptions {
  readonly baseUrl?: string;
  readonly fetch?: Fetch;
  readonly now?: () => number;
}

interface CachedToken extends MtnAccessTokenResult {
  readonly expiresAtMs: number;
}

const TOKEN_SAFETY_MARGIN_MS = 30_000;
const MAX_PROVIDER_BODY_LENGTH = 8192;
const MAX_EVIDENCE_LENGTH = 240;
const MAX_MESSAGE_LENGTH = 160;
const AMOUNT = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const MSISDN = /^[1-9][0-9]{7,14}$/;

function bounded(value: unknown, max = MAX_EVIDENCE_LENGTH): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

function safeFailure(
  code: MtnCollectionsErrorCode,
  httpStatus: number | null,
  providerCode: string | null = null,
): MtnCollectionsFailure {
  const messages: Record<MtnCollectionsErrorCode, string> = {
    AUTHENTICATION_FAILURE: 'MTN authentication failed.',
    AUTHORIZATION_FAILURE: 'MTN authorization failed.',
    DUPLICATE_REFERENCE: 'MTN reference already exists.',
    NOT_FOUND: 'MTN request was not found.',
    INVALID_TARGET_ENVIRONMENT: 'MTN target environment was rejected.',
    INVALID_CURRENCY: 'MTN currency was rejected.',
    PROVIDER_UNAVAILABLE: 'MTN Collections is unavailable.',
    BAD_REQUEST: 'MTN rejected the request contract.',
    TIMEOUT: 'MTN transport timed out.',
    CONNECTION_FAILURE: 'MTN transport connection failed.',
    UNEXPECTED_RESPONSE: 'MTN returned an unexpected response.',
  };
  return { code, message: messages[code], httpStatus, providerCode };
}

function providerCodeFrom(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  return bounded(record.code ?? record.error, 80);
}

function codeForHttpStatus(
  status: number,
  providerCode: string | null,
): MtnCollectionsErrorCode {
  if (providerCode === 'RESOURCE_ALREADY_EXIST' || status === 409)
    return 'DUPLICATE_REFERENCE';
  if (providerCode === 'NOT_ALLOWED_TARGET_ENVIRONMENT')
    return 'INVALID_TARGET_ENVIRONMENT';
  if (providerCode === 'INVALID_CURRENCY') return 'INVALID_CURRENCY';
  if (providerCode === 'SERVICE_UNAVAILABLE' || status === 503)
    return 'PROVIDER_UNAVAILABLE';
  if (status === 401) return 'AUTHENTICATION_FAILURE';
  if (status === 403 || providerCode === 'NOT_ALLOWED')
    return 'AUTHORIZATION_FAILURE';
  if (status === 404 || providerCode === 'RESOURCE_NOT_FOUND')
    return 'NOT_FOUND';
  if (status === 400) return 'BAD_REQUEST';
  return 'UNEXPECTED_RESPONSE';
}

function transportFailure(error: unknown): MtnCollectionsFailure {
  if (
    error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return safeFailure('TIMEOUT', null);
  }
  return safeFailure('CONNECTION_FAILURE', null);
}

async function readJson(response: Response): Promise<unknown> {
  const text = (await response.text()).slice(0, MAX_PROVIDER_BODY_LENGTH);
  if (text.trim().length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new MtnCollectionsClientError(
      safeFailure('UNEXPECTED_RESPONSE', response.status),
    );
  }
}

function validateInput(input: MtnRequestToPayInput): void {
  if (!isMtnReferenceId(input.referenceId))
    throw new TypeError('MTN referenceId must be a UUID v4.');
  if (
    !AMOUNT.test(input.amount) ||
    input.amount.length > 64 ||
    Number(input.amount) <= 0
  ) {
    throw new TypeError('MTN amount must be a positive decimal string.');
  }
  if (!MSISDN.test(input.payerMsisdn))
    throw new TypeError('MTN payerMsisdn must be an international MSISDN.');
  if (input.externalId.length === 0 || input.externalId.length > 160)
    throw new TypeError('MTN externalId must contain 1-160 characters.');
  for (const [field, value] of [
    ['payerMessage', input.payerMessage],
    ['payeeNote', input.payeeNote],
  ] as const) {
    if (value.length === 0 || value.length > MAX_MESSAGE_LENGTH) {
      throw new TypeError(`MTN ${field} must contain 1-160 characters.`);
    }
  }
}

export class HttpMtnCollectionsClient implements MtnCollectionsClient {
  private readonly baseUrl: string;
  private readonly fetch: Fetch;
  private readonly now: () => number;
  private cachedToken: CachedToken | null = null;
  private tokenRefresh: Promise<CachedToken> | null = null;

  public constructor(
    private readonly config: EnabledMtnConfig,
    options: MtnCollectionsClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? MTN_MOMO_SANDBOX_BASE_URL).replace(
      /\/$/,
      '',
    );
    this.fetch = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
  }

  public async getAccessToken(): Promise<MtnAccessTokenResult> {
    const cached = this.cachedToken;
    if (
      cached !== null &&
      this.now() + TOKEN_SAFETY_MARGIN_MS < cached.expiresAtMs
    ) {
      return this.publicToken(cached);
    }

    this.tokenRefresh ??= this.fetchAccessToken().finally(() => {
      this.tokenRefresh = null;
    });
    return this.publicToken(await this.tokenRefresh);
  }

  public async requestToPay(
    input: MtnRequestToPayInput,
  ): Promise<MtnRequestToPaySubmissionResult> {
    validateInput(input);
    let token: MtnAccessTokenResult;
    try {
      token = await this.getAccessToken();
    } catch (error) {
      const failure = this.failureFrom(error);
      return {
        outcome: 'REJECTED',
        referenceId: input.referenceId,
        error: failure,
      };
    }

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/collection/v1_0/requesttopay`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token.accessToken}`,
            'content-type': 'application/json',
            'ocp-apim-subscription-key': this.config.subscriptionKey,
            'x-reference-id': input.referenceId,
            'x-target-environment': MTN_MOMO_SANDBOX_TARGET_ENVIRONMENT,
            ...(this.config.callbackUrl === undefined
              ? {}
              : { 'x-callback-url': this.config.callbackUrl }),
          },
          body: JSON.stringify({
            amount: input.amount,
            currency: MTN_MOMO_SANDBOX_CURRENCY,
            externalId: input.externalId,
            payer: { partyIdType: 'MSISDN', partyId: input.payerMsisdn },
            payerMessage: input.payerMessage,
            payeeNote: input.payeeNote,
          }),
        },
      );
    } catch (error) {
      return {
        outcome: 'UNKNOWN',
        referenceId: input.referenceId,
        error: transportFailure(error),
      };
    }

    if (response.status === 202) {
      return { outcome: 'ACCEPTED', referenceId: input.referenceId };
    }

    const error = await this.errorFromResponse(response);
    return { outcome: 'REJECTED', referenceId: input.referenceId, error };
  }

  public async getRequestToPayStatus(
    referenceId: string,
  ): Promise<MtnRequestToPayStatusResult> {
    if (!isMtnReferenceId(referenceId))
      throw new TypeError('MTN referenceId must be a UUID v4.');

    let token: MtnAccessTokenResult;
    try {
      token = await this.getAccessToken();
    } catch (error) {
      return {
        outcome: 'TECHNICAL_FAILURE',
        referenceId,
        error: this.failureFrom(error),
      };
    }

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/collection/v1_0/requesttopay/${referenceId}`,
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${token.accessToken}`,
            'ocp-apim-subscription-key': this.config.subscriptionKey,
            'x-target-environment': MTN_MOMO_SANDBOX_TARGET_ENVIRONMENT,
          },
        },
      );
    } catch (error) {
      return {
        outcome: 'TECHNICAL_FAILURE',
        referenceId,
        error: transportFailure(error),
      };
    }

    if (response.status === 404) {
      return {
        outcome: 'NOT_FOUND',
        referenceId,
        error: await this.errorFromResponse(response),
      };
    }
    if (response.status !== 200) {
      return {
        outcome: 'TECHNICAL_FAILURE',
        referenceId,
        error: await this.errorFromResponse(response),
      };
    }

    try {
      const body = await readJson(response);
      if (typeof body !== 'object' || body === null)
        throw new MtnCollectionsClientError(
          safeFailure('UNEXPECTED_RESPONSE', response.status),
        );
      const record = body as Record<string, unknown>;
      const status = record.status;
      if (
        status !== 'PENDING' &&
        status !== 'SUCCESSFUL' &&
        status !== 'FAILED'
      ) {
        throw new MtnCollectionsClientError(
          safeFailure('UNEXPECTED_RESPONSE', response.status),
        );
      }
      const reason =
        typeof record.reason === 'object' && record.reason !== null
          ? (record.reason as Record<string, unknown>)
          : {};
      return {
        outcome: status,
        referenceId,
        providerStatus: status,
        amount: bounded(record.amount, 64),
        currency: bounded(record.currency, 3),
        financialTransactionId: bounded(record.financialTransactionId, 160),
        externalId: bounded(record.externalId, 160),
        reasonCode: bounded(reason.code, 80),
        reasonMessage: bounded(reason.message, MAX_EVIDENCE_LENGTH),
      };
    } catch (error) {
      return {
        outcome: 'TECHNICAL_FAILURE',
        referenceId,
        error: this.failureFrom(error),
      };
    }
  }

  private async fetchAccessToken(): Promise<CachedToken> {
    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${this.baseUrl}/collection/token/`,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${Buffer.from(
              `${this.config.apiUser}:${this.config.apiKey}`,
            ).toString('base64')}`,
            'ocp-apim-subscription-key': this.config.subscriptionKey,
          },
        },
      );
    } catch (error) {
      throw new MtnCollectionsClientError(transportFailure(error));
    }

    if (response.status !== 200) {
      throw new MtnCollectionsClientError(
        await this.errorFromResponse(response),
      );
    }

    const body = await readJson(response);
    if (typeof body !== 'object' || body === null) {
      throw new MtnCollectionsClientError(
        safeFailure('UNEXPECTED_RESPONSE', response.status),
      );
    }
    const record = body as Record<string, unknown>;
    const accessToken = record.access_token;
    const tokenType = record.token_type;
    const expiresInSeconds = record.expires_in;
    if (
      typeof accessToken !== 'string' ||
      accessToken.length === 0 ||
      accessToken.length > 8192 ||
      typeof tokenType !== 'string' ||
      tokenType.length === 0 ||
      tokenType.length > 80 ||
      !Number.isSafeInteger(expiresInSeconds) ||
      (expiresInSeconds as number) <= 0
    ) {
      throw new MtnCollectionsClientError(
        safeFailure('UNEXPECTED_RESPONSE', response.status),
      );
    }

    const token: CachedToken = {
      accessToken,
      tokenType,
      expiresInSeconds: expiresInSeconds as number,
      expiresAtMs: this.now() + (expiresInSeconds as number) * 1000,
    };
    this.cachedToken = token;
    return token;
  }

  private async fetchWithTimeout(
    input: string,
    init: RequestInit,
  ): Promise<Response> {
    return this.fetch(input, {
      ...init,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });
  }

  private async errorFromResponse(
    response: Response,
  ): Promise<MtnCollectionsFailure> {
    let providerCode: string | null = null;
    try {
      providerCode = providerCodeFrom(await readJson(response));
    } catch {
      return safeFailure('UNEXPECTED_RESPONSE', response.status);
    }
    return safeFailure(
      codeForHttpStatus(response.status, providerCode),
      response.status,
      providerCode,
    );
  }

  private failureFrom(error: unknown): MtnCollectionsFailure {
    if (error instanceof MtnCollectionsClientError) return error.toJSON();
    return safeFailure('UNEXPECTED_RESPONSE', null);
  }

  private publicToken(token: CachedToken): MtnAccessTokenResult {
    return {
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      expiresInSeconds: token.expiresInSeconds,
    };
  }
}
