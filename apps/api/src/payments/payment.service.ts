import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import { paymentRequestHash } from './payment-idempotency';
import type { PaymentListQuery } from './payment-query.schema';
import type { ReportPaymentInput } from './payment.schema';
import { derivePaymentSummary } from './payment-summary';
import {
  PAYMENT_STORE,
  PaymentIdempotencyConflictError,
  PaymentOrderIneligibleError,
  PaymentTransitionNotAllowedError,
  type PaymentStore,
  type PaymentTransactionRecord,
  type PaymentTransition,
} from './payment.store';

@Injectable()
export class PaymentService {
  public constructor(
    @Inject(PAYMENT_STORE) private readonly store: PaymentStore,
  ) {}

  public async report(
    context: ResolvedMerchantContext,
    orderId: string,
    input: ReportPaymentInput,
    idempotencyKey: string,
  ) {
    try {
      const payment = await this.store.report(context.merchant.id, orderId, {
        ...input,
        amountValue: BigInt(input.amount),
        idempotencyKey,
        requestHash: paymentRequestHash(orderId, input),
        now: new Date(),
      });
      if (payment === null) throw new NotFoundException('Not found.');
      return this.mapPayment(payment);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async list(
    context: ResolvedMerchantContext,
    orderId: string,
    query: PaymentListQuery,
  ) {
    const result = await this.store.list(context.merchant.id, orderId, query);
    if (result === null) throw new NotFoundException('Not found.');
    return {
      items: result.rows.map((payment) => this.mapPayment(payment)),
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
    };
  }

  public async detail(
    context: ResolvedMerchantContext,
    orderId: string,
    paymentId: string,
  ) {
    const payment = await this.store.detail(
      context.merchant.id,
      orderId,
      paymentId,
    );
    if (payment === null) throw new NotFoundException('Not found.');
    return this.mapPayment(payment);
  }

  public async transition(
    context: ResolvedMerchantContext,
    orderId: string,
    paymentId: string,
    target: PaymentTransition,
  ) {
    try {
      const payment = await this.store.transition(
        context.merchant.id,
        orderId,
        paymentId,
        target,
        new Date(),
      );
      if (payment === null) throw new NotFoundException('Not found.');
      return this.mapPayment(payment);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async summary(context: ResolvedMerchantContext, orderId: string) {
    const record = await this.store.summary(context.merchant.id, orderId);
    if (record === null) throw new NotFoundException('Not found.');
    const derived = derivePaymentSummary(
      record.orderAmount,
      record.verifiedAmount,
    );
    return {
      orderId,
      currency: record.currency,
      orderAmount: record.orderAmount.toString(),
      verifiedAmount: record.verifiedAmount.toString(),
      amountDue: derived.amountDue.toString(),
      overpaidAmount: derived.overpaidAmount.toString(),
      status: derived.status,
    };
  }

  private mapPayment(payment: PaymentTransactionRecord) {
    return {
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      status: payment.status,
      verificationSource: payment.verificationSource,
      amount: payment.amount.toString(),
      currency: payment.currency,
      payerPhone: payment.payerPhone,
      providerReference: payment.providerReference,
      merchantReference: payment.merchantReference,
      note: payment.note,
      reportedAt: payment.reportedAt.toISOString(),
      verificationPendingAt:
        payment.verificationPendingAt?.toISOString() ?? null,
      verifiedAt: payment.verifiedAt?.toISOString() ?? null,
      rejectedAt: payment.rejectedAt?.toISOString() ?? null,
      failedAt: payment.failedAt?.toISOString() ?? null,
      reversedAt: payment.reversedAt?.toISOString() ?? null,
      refundedAt: payment.refundedAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }

  private mapError(error: unknown): never {
    if (error instanceof PaymentIdempotencyConflictError) {
      throw new ConflictException('Payment idempotency key conflict.');
    }
    if (error instanceof PaymentOrderIneligibleError) {
      throw new UnprocessableEntityException(
        'Order cannot accept a payment report.',
      );
    }
    if (error instanceof PaymentTransitionNotAllowedError) {
      throw new ConflictException('Payment transition is not allowed.');
    }
    throw error;
  }
}
