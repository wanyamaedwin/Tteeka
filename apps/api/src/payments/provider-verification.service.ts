import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import {
  PROVIDER_VERIFICATION_REGISTRY,
  type ProviderVerificationInput,
  type ProviderVerificationRegistry,
  type ProviderVerificationResult,
} from './provider-verification';
import type { VerificationAttemptListQuery } from './provider-verification.schema';
import {
  PROVIDER_VERIFICATION_STORE,
  ProviderReferenceRequiredError,
  ProviderVerificationIdempotencyConflictError,
  ProviderVerificationNotApplicableError,
  ProviderVerificationStateConflictError,
  type CompleteProviderVerificationCommand,
  type CompletedProviderVerification,
  type PaymentVerificationAttemptRecord,
  type ProviderVerificationStore,
} from './provider-verification.store';

const UNAVAILABLE_CODE = 'PROVIDER_VERIFICATION_UNAVAILABLE';

function bounded(value: string | null | undefined, max: number): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

export function completionFromResult(
  input: ProviderVerificationInput,
  result: ProviderVerificationResult,
  now: Date,
): CompleteProviderVerificationCommand {
  const evidence = {
    providerTransactionId: bounded(result.providerTransactionId, 160),
    providerStatusCode: bounded(result.providerStatusCode, 80),
    providerStatusText: bounded(result.providerStatusText, 240),
    now,
  };
  if (result.outcome === 'FAILED') {
    return {
      ...evidence,
      status: 'FAILED',
      failureCode: bounded(result.failureCode, 80) ?? 'ADAPTER_FAILURE',
      failureMessage: bounded(result.failureMessage, 500),
    };
  }
  if (result.outcome === 'NOT_VERIFIED') {
    return {
      ...evidence,
      status: 'NOT_VERIFIED',
      failureCode: null,
      failureMessage: null,
    };
  }
  const matches =
    result.provider === input.provider &&
    result.amount === input.amount &&
    result.currency === input.currency &&
    (result.payerPhone === undefined ||
      result.payerPhone === null ||
      result.payerPhone === input.payerPhone) &&
    (result.providerReference === undefined ||
      result.providerReference === null ||
      result.providerReference === input.providerReference);
  return {
    ...evidence,
    status: matches ? 'VERIFIED' : 'NOT_VERIFIED',
    failureCode: null,
    failureMessage: null,
  };
}

@Injectable()
export class ProviderVerificationService {
  public constructor(
    @Inject(PROVIDER_VERIFICATION_STORE)
    private readonly store: ProviderVerificationStore,
    @Inject(PROVIDER_VERIFICATION_REGISTRY)
    private readonly registry: ProviderVerificationRegistry,
  ) {}

  public async verify(
    context: ResolvedMerchantContext,
    orderId: string,
    paymentId: string,
    idempotencyKey: string,
  ) {
    try {
      const begun = await this.store.begin(
        context.merchant.id,
        orderId,
        paymentId,
        { idempotencyKey, now: new Date() },
      );
      if (begun === null) throw new NotFoundException('Not found.');
      if (!begun.isNew) {
        if (begun.attempt.failureCode === UNAVAILABLE_CODE) {
          throw new ServiceUnavailableException(
            'Provider verification is unavailable.',
          );
        }
        return this.mapResult({
          payment: begun.payment,
          attempt: begun.attempt,
        });
      }
      const adapter = this.registry.resolve(begun.adapterInput.provider);
      if (adapter === null) {
        await this.store.complete(
          context.merchant.id,
          orderId,
          paymentId,
          begun.attempt.id,
          {
            status: 'FAILED',
            providerTransactionId: null,
            providerStatusCode: null,
            providerStatusText: null,
            failureCode: UNAVAILABLE_CODE,
            failureMessage: 'No provider verification adapter is configured.',
            now: new Date(),
          },
        );
        throw new ServiceUnavailableException(
          'Provider verification is unavailable.',
        );
      }
      let result: ProviderVerificationResult;
      try {
        result = await adapter.verifyPayment(begun.adapterInput);
      } catch {
        result = {
          outcome: 'FAILED',
          failureCode: 'ADAPTER_ERROR',
          failureMessage: 'Provider verification failed.',
        };
      }
      const completed = await this.store.complete(
        context.merchant.id,
        orderId,
        paymentId,
        begun.attempt.id,
        completionFromResult(begun.adapterInput, result, new Date()),
      );
      if (completed === null) throw new NotFoundException('Not found.');
      return this.mapResult(completed);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async list(
    context: ResolvedMerchantContext,
    orderId: string,
    paymentId: string,
    query: VerificationAttemptListQuery,
  ) {
    const result = await this.store.list(
      context.merchant.id,
      orderId,
      paymentId,
      query,
    );
    if (result === null) throw new NotFoundException('Not found.');
    return {
      items: result.rows.map((attempt) => this.mapAttempt(attempt)),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  private mapResult(result: CompletedProviderVerification) {
    return {
      payment: {
        id: result.payment.id,
        status: result.payment.status,
        verificationSource: result.payment.verificationSource,
        verifiedAt: result.payment.verifiedAt?.toISOString() ?? null,
      },
      attempt: this.mapAttempt(result.attempt),
    };
  }

  private mapAttempt(attempt: PaymentVerificationAttemptRecord) {
    return {
      id: attempt.id,
      provider: attempt.provider,
      status: attempt.status,
      providerTransactionId: attempt.providerTransactionId,
      providerStatusCode: attempt.providerStatusCode,
      providerStatusText: attempt.providerStatusText,
      failureCode: attempt.failureCode,
      failureMessage: attempt.failureMessage,
      requestedAt: attempt.requestedAt.toISOString(),
      completedAt: attempt.completedAt?.toISOString() ?? null,
      createdAt: attempt.createdAt.toISOString(),
    };
  }

  private mapError(error: unknown): never {
    if (error instanceof ProviderVerificationIdempotencyConflictError) {
      throw new ConflictException(
        'Provider verification idempotency key conflict.',
      );
    }
    if (error instanceof ProviderVerificationStateConflictError) {
      throw new ConflictException('Provider verification is not allowed.');
    }
    if (error instanceof ProviderVerificationNotApplicableError) {
      throw new UnprocessableEntityException(
        'Provider verification does not apply to this Payment.',
      );
    }
    if (error instanceof ProviderReferenceRequiredError) {
      throw new UnprocessableEntityException(
        'Provider reference is required for verification.',
      );
    }
    throw error;
  }
}
