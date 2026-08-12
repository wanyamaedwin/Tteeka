import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import {
  deliveryAttemptRequestHash,
  deliveryCreateRequestHash,
} from './delivery-idempotency';
import type {
  DeliveryAttemptListQuery,
  DeliveryListQuery,
} from './delivery-query.schema';
import type {
  CreateDeliveryInput,
  RecordDeliveryAttemptInput,
} from './delivery.schema';
import {
  DELIVERY_STORE,
  DeliveryAlreadyExistsError,
  DeliveryAttemptIdempotencyConflictError,
  type DeliveryAttemptRecord,
  DeliveryIdempotencyConflictError,
  DeliveryInvalidTransitionError,
  type DeliveryJobRecord,
  DeliveryLocationRequiredError,
  DeliveryOrderIneligibleError,
  DeliveryOrderUnavailableError,
  type DeliveryStore,
} from './delivery.store';

@Injectable()
export class DeliveryService {
  public constructor(
    @Inject(DELIVERY_STORE) private readonly store: DeliveryStore,
  ) {}

  public async create(
    context: ResolvedMerchantContext,
    input: CreateDeliveryInput,
    idempotencyKey: string,
  ) {
    try {
      return this.mapDelivery(
        await this.store.create(context.merchant.id, {
          ...input,
          idempotencyKey,
          requestHash: deliveryCreateRequestHash(input),
        }),
      );
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async list(
    context: ResolvedMerchantContext,
    query: DeliveryListQuery,
  ) {
    const result = await this.store.list(context.merchant.id, query);
    return {
      deliveries: result.rows.map((row) => this.mapDeliverySummary(row)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
  }

  public async detail(context: ResolvedMerchantContext, deliveryId: string) {
    const delivery = await this.store.find(context.merchant.id, deliveryId);
    if (delivery === null) throw new NotFoundException('Not found.');
    return this.mapDelivery(delivery);
  }

  public async transition(
    context: ResolvedMerchantContext,
    deliveryId: string,
    target: 'READY' | 'DISPATCHED' | 'CANCELLED',
  ) {
    try {
      const delivery = await this.store.transition(
        context.merchant.id,
        deliveryId,
        target,
      );
      if (delivery === null) throw new NotFoundException('Not found.');
      return this.mapDelivery(delivery);
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async recordAttempt(
    context: ResolvedMerchantContext,
    deliveryId: string,
    input: RecordDeliveryAttemptInput,
    idempotencyKey: string,
  ) {
    try {
      const result = await this.store.recordAttempt(
        context.merchant.id,
        deliveryId,
        {
          ...input,
          idempotencyKey,
          requestHash: deliveryAttemptRequestHash(deliveryId, input),
        },
      );
      if (result === null) throw new NotFoundException('Not found.');
      return {
        delivery: this.mapDelivery(result.delivery),
        attempt: this.mapAttempt(result.attempt),
      };
    } catch (error: unknown) {
      this.mapError(error);
    }
  }

  public async attempts(
    context: ResolvedMerchantContext,
    deliveryId: string,
    query: DeliveryAttemptListQuery,
  ) {
    const result = await this.store.listAttempts(
      context.merchant.id,
      deliveryId,
      query,
    );
    if (result === null) throw new NotFoundException('Not found.');
    return {
      deliveryId,
      attempts: result.rows.map((row) => this.mapAttempt(row)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: result.total,
        totalPages: Math.ceil(result.total / query.pageSize),
      },
    };
  }

  private mapDeliverySummary(delivery: DeliveryJobRecord) {
    return {
      id: delivery.id,
      orderId: delivery.orderId,
      status: delivery.status,
      recipientNameSnapshot: delivery.recipientNameSnapshot,
      deliveryPhoneSnapshot: delivery.deliveryPhoneSnapshot,
      areaSnapshot: delivery.areaSnapshot,
      landmarkSnapshot: delivery.landmarkSnapshot,
      createdAt: delivery.createdAt.toISOString(),
      updatedAt: delivery.updatedAt.toISOString(),
      readyAt: delivery.readyAt?.toISOString() ?? null,
      dispatchedAt: delivery.dispatchedAt?.toISOString() ?? null,
      deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
      failedAt: delivery.failedAt?.toISOString() ?? null,
      cancelledAt: delivery.cancelledAt?.toISOString() ?? null,
    };
  }

  private mapDelivery(delivery: DeliveryJobRecord) {
    return {
      id: delivery.id,
      orderId: delivery.orderId,
      status: delivery.status,
      recipientNameSnapshot: delivery.recipientNameSnapshot,
      recipientPhoneSnapshot: delivery.recipientPhoneSnapshot,
      areaSnapshot: delivery.areaSnapshot,
      landmarkSnapshot: delivery.landmarkSnapshot,
      deliveryPhoneSnapshot: delivery.deliveryPhoneSnapshot,
      instructionsSnapshot: delivery.instructionsSnapshot,
      mapPinUrlSnapshot: delivery.mapPinUrlSnapshot,
      createdAt: delivery.createdAt.toISOString(),
      updatedAt: delivery.updatedAt.toISOString(),
      readyAt: delivery.readyAt?.toISOString() ?? null,
      dispatchedAt: delivery.dispatchedAt?.toISOString() ?? null,
      deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
      failedAt: delivery.failedAt?.toISOString() ?? null,
      cancelledAt: delivery.cancelledAt?.toISOString() ?? null,
    };
  }

  private mapAttempt(attempt: DeliveryAttemptRecord) {
    return {
      id: attempt.id,
      deliveryJobId: attempt.deliveryJobId,
      attemptNumber: attempt.attemptNumber,
      result: attempt.result,
      failureReason: attempt.failureReason,
      note: attempt.note,
      attemptedAt: attempt.attemptedAt.toISOString(),
      createdAt: attempt.createdAt.toISOString(),
    };
  }

  private mapError(error: unknown): never {
    if (error instanceof DeliveryIdempotencyConflictError) {
      throw new ConflictException('Idempotency key already used.');
    }
    if (error instanceof DeliveryAlreadyExistsError) {
      throw new ConflictException('Delivery already exists for this order.');
    }
    if (error instanceof DeliveryAttemptIdempotencyConflictError) {
      throw new ConflictException('Attempt idempotency key already used.');
    }
    if (error instanceof DeliveryOrderUnavailableError) {
      throw new UnprocessableEntityException(
        'Order is unavailable for delivery.',
      );
    }
    if (error instanceof DeliveryOrderIneligibleError) {
      throw new UnprocessableEntityException(
        'Order is not eligible for delivery.',
      );
    }
    if (error instanceof DeliveryLocationRequiredError) {
      throw new UnprocessableEntityException(
        'A complete Order delivery location is required.',
      );
    }
    if (error instanceof DeliveryInvalidTransitionError) {
      throw new ConflictException('Delivery transition is not allowed.');
    }
    throw error;
  }
}
