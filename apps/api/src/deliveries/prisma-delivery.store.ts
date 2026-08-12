import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type {
  DeliveryAttemptListQuery,
  DeliveryListQuery,
} from './delivery-query.schema';
import {
  DeliveryAlreadyExistsError,
  DeliveryAttemptIdempotencyConflictError,
  type DeliveryAttemptListResult,
  type DeliveryAttemptRecord,
  DeliveryIdempotencyConflictError,
  DeliveryInvalidTransitionError,
  type DeliveryJobRecord,
  type DeliveryListResult,
  DeliveryLocationRequiredError,
  DeliveryOrderIneligibleError,
  DeliveryOrderUnavailableError,
  type CreateDeliveryCommand,
  type DeliveryStore,
  type RecordDeliveryAttemptCommand,
} from './delivery.store';

const deliverySelect = {
  id: true,
  merchantId: true,
  orderId: true,
  status: true,
  recipientNameSnapshot: true,
  recipientPhoneSnapshot: true,
  areaSnapshot: true,
  landmarkSnapshot: true,
  deliveryPhoneSnapshot: true,
  instructionsSnapshot: true,
  mapPinUrlSnapshot: true,
  requestHash: true,
  createdAt: true,
  updatedAt: true,
  readyAt: true,
  dispatchedAt: true,
  deliveredAt: true,
  failedAt: true,
  cancelledAt: true,
} as const;

const attemptSelect = {
  id: true,
  merchantId: true,
  deliveryJobId: true,
  attemptNumber: true,
  result: true,
  failureReason: true,
  note: true,
  attemptedAt: true,
  requestHash: true,
  createdAt: true,
} as const;

const orderDeliverySnapshotSelect = {
  id: true,
  status: true,
  customerNameSnapshot: true,
  customerPhoneSnapshot: true,
  deliveryLocationId: true,
  deliveryAreaSnapshot: true,
  deliveryLandmarkSnapshot: true,
  deliveryPhoneSnapshot: true,
  deliveryInstructionsSnapshot: true,
  deliveryMapPinUrlSnapshot: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function isExactCreationReplay(
  replay: DeliveryJobRecord,
  command: CreateDeliveryCommand,
): boolean {
  return (
    replay.orderId === command.orderId &&
    replay.requestHash === command.requestHash
  );
}

function isExactAttemptReplay(
  replay: DeliveryAttemptRecord,
  deliveryId: string,
  command: RecordDeliveryAttemptCommand,
): boolean {
  return (
    replay.deliveryJobId === deliveryId &&
    replay.requestHash === command.requestHash
  );
}

@Injectable()
export class PrismaDeliveryStore implements DeliveryStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async create(
    merchantId: string,
    command: CreateDeliveryCommand,
  ): Promise<DeliveryJobRecord> {
    const existingReplay = await this.database.client.deliveryJob.findUnique({
      where: {
        merchantId_idempotencyKey: {
          merchantId,
          idempotencyKey: command.idempotencyKey,
        },
      },
      select: deliverySelect,
    });
    if (existingReplay !== null) {
      if (!isExactCreationReplay(existingReplay, command)) {
        throw new DeliveryIdempotencyConflictError();
      }
      return existingReplay;
    }

    try {
      return await this.database.client.$transaction(async (transaction) => {
        const locked = await transaction.$queryRaw<readonly { id: string }[]>`
          SELECT "id" FROM "orders"
          WHERE "merchant_id" = ${merchantId}::uuid
            AND "id" = ${command.orderId}::uuid
          FOR UPDATE`;
        if (locked.length === 0) throw new DeliveryOrderUnavailableError();

        const replay = await transaction.deliveryJob.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: deliverySelect,
        });
        if (replay !== null) {
          if (!isExactCreationReplay(replay, command)) {
            throw new DeliveryIdempotencyConflictError();
          }
          return replay;
        }

        const existingForOrder = await transaction.deliveryJob.findUnique({
          where: {
            merchantId_orderId: { merchantId, orderId: command.orderId },
          },
          select: { id: true },
        });
        if (existingForOrder !== null) throw new DeliveryAlreadyExistsError();

        const order = await transaction.order.findUniqueOrThrow({
          where: {
            merchantId_id: { merchantId, id: command.orderId },
          },
          select: orderDeliverySnapshotSelect,
        });
        if (order.status !== 'CONFIRMED') {
          throw new DeliveryOrderIneligibleError();
        }
        if (
          order.deliveryLocationId === null ||
          order.deliveryAreaSnapshot === null ||
          order.deliveryLandmarkSnapshot === null ||
          order.deliveryPhoneSnapshot === null
        ) {
          throw new DeliveryLocationRequiredError();
        }

        return transaction.deliveryJob.create({
          data: {
            merchantId,
            orderId: order.id,
            recipientNameSnapshot: order.customerNameSnapshot,
            recipientPhoneSnapshot: order.customerPhoneSnapshot,
            areaSnapshot: order.deliveryAreaSnapshot,
            landmarkSnapshot: order.deliveryLandmarkSnapshot,
            deliveryPhoneSnapshot: order.deliveryPhoneSnapshot,
            instructionsSnapshot: order.deliveryInstructionsSnapshot,
            mapPinUrlSnapshot: order.deliveryMapPinUrlSnapshot,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
          },
          select: deliverySelect,
        });
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const [replay, existingForOrder] = await Promise.all([
        this.database.client.deliveryJob.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: deliverySelect,
        }),
        this.database.client.deliveryJob.findUnique({
          where: {
            merchantId_orderId: { merchantId, orderId: command.orderId },
          },
          select: { id: true },
        }),
      ]);
      if (replay !== null && isExactCreationReplay(replay, command)) {
        return replay;
      }
      if (existingForOrder !== null) throw new DeliveryAlreadyExistsError();
      throw new DeliveryIdempotencyConflictError();
    }
  }

  public async list(
    merchantId: string,
    query: DeliveryListQuery,
  ): Promise<DeliveryListResult> {
    const where = {
      merchantId,
      ...(query.orderId === undefined ? {} : { orderId: query.orderId }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              {
                recipientNameSnapshot: {
                  contains: query.q,
                  mode: 'insensitive' as const,
                },
              },
              { recipientPhoneSnapshot: { contains: query.q } },
              { deliveryPhoneSnapshot: { contains: query.q } },
              {
                areaSnapshot: {
                  contains: query.q,
                  mode: 'insensitive' as const,
                },
              },
              {
                landmarkSnapshot: {
                  contains: query.q,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }),
      ...(query.createdFrom === undefined && query.createdTo === undefined
        ? {}
        : {
            createdAt: {
              ...(query.createdFrom === undefined
                ? {}
                : { gte: query.createdFrom }),
              ...(query.createdTo === undefined ? {} : { lt: query.createdTo }),
            },
          }),
    };
    const [total, rows] = await this.database.client.$transaction([
      this.database.client.deliveryJob.count({ where }),
      this.database.client.deliveryJob.findMany({
        where,
        select: deliverySelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows, total };
  }

  public find(
    merchantId: string,
    deliveryId: string,
  ): Promise<DeliveryJobRecord | null> {
    return this.database.client.deliveryJob.findFirst({
      where: { merchantId, id: deliveryId },
      select: deliverySelect,
    });
  }

  public async transition(
    merchantId: string,
    deliveryId: string,
    target: 'READY' | 'DISPATCHED' | 'CANCELLED',
  ): Promise<DeliveryJobRecord | null> {
    const observed = await this.database.client.deliveryJob.findFirst({
      where: { merchantId, id: deliveryId },
      select: { status: true },
    });
    if (observed === null) return null;

    return this.database.client.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<readonly { id: string }[]>`
        SELECT "id" FROM "delivery_jobs"
        WHERE "merchant_id" = ${merchantId}::uuid
          AND "id" = ${deliveryId}::uuid
        FOR UPDATE`;
      if (locked.length === 0) return null;
      const current = await transaction.deliveryJob.findUniqueOrThrow({
        where: { merchantId_id: { merchantId, id: deliveryId } },
        select: deliverySelect,
      });
      if (current.status === target) return current;
      if (current.status !== observed.status) {
        throw new DeliveryInvalidTransitionError();
      }

      const allowed =
        (target === 'READY' && current.status === 'PENDING') ||
        (target === 'DISPATCHED' && current.status === 'READY') ||
        (target === 'CANCELLED' &&
          (current.status === 'PENDING' || current.status === 'READY'));
      if (!allowed) throw new DeliveryInvalidTransitionError();

      const now = new Date();
      return transaction.deliveryJob.update({
        where: { merchantId_id: { merchantId, id: deliveryId } },
        data:
          target === 'READY'
            ? { status: target, readyAt: now }
            : target === 'DISPATCHED'
              ? { status: target, dispatchedAt: now }
              : { status: target, cancelledAt: now },
        select: deliverySelect,
      });
    });
  }

  public async recordAttempt(
    merchantId: string,
    deliveryId: string,
    command: RecordDeliveryAttemptCommand,
  ): Promise<{
    delivery: DeliveryJobRecord;
    attempt: DeliveryAttemptRecord;
  } | null> {
    const existingReplay =
      await this.database.client.deliveryAttempt.findUnique({
        where: {
          merchantId_idempotencyKey: {
            merchantId,
            idempotencyKey: command.idempotencyKey,
          },
        },
        select: attemptSelect,
      });
    if (existingReplay !== null) {
      if (!isExactAttemptReplay(existingReplay, deliveryId, command)) {
        throw new DeliveryAttemptIdempotencyConflictError();
      }
      const delivery = await this.find(merchantId, deliveryId);
      return delivery === null ? null : { delivery, attempt: existingReplay };
    }

    try {
      return await this.database.client.$transaction(async (transaction) => {
        const locked = await transaction.$queryRaw<readonly { id: string }[]>`
          SELECT "id" FROM "delivery_jobs"
          WHERE "merchant_id" = ${merchantId}::uuid
            AND "id" = ${deliveryId}::uuid
          FOR UPDATE`;
        if (locked.length === 0) return null;

        const replay = await transaction.deliveryAttempt.findUnique({
          where: {
            merchantId_idempotencyKey: {
              merchantId,
              idempotencyKey: command.idempotencyKey,
            },
          },
          select: attemptSelect,
        });
        if (replay !== null) {
          if (!isExactAttemptReplay(replay, deliveryId, command)) {
            throw new DeliveryAttemptIdempotencyConflictError();
          }
          const delivery = await transaction.deliveryJob.findUniqueOrThrow({
            where: { merchantId_id: { merchantId, id: deliveryId } },
            select: deliverySelect,
          });
          return { delivery, attempt: replay };
        }

        const current = await transaction.deliveryJob.findUniqueOrThrow({
          where: { merchantId_id: { merchantId, id: deliveryId } },
          select: deliverySelect,
        });
        if (current.status !== 'DISPATCHED') {
          throw new DeliveryInvalidTransitionError();
        }

        const aggregate = await transaction.deliveryAttempt.aggregate({
          where: { merchantId, deliveryJobId: deliveryId },
          _max: { attemptNumber: true },
        });
        const attemptNumber = (aggregate._max.attemptNumber ?? 0) + 1;
        const attemptedAt = new Date();
        const attempt = await transaction.deliveryAttempt.create({
          data: {
            merchantId,
            deliveryJobId: deliveryId,
            attemptNumber,
            result: command.result,
            failureReason: command.failureReason,
            note: command.note,
            attemptedAt,
            idempotencyKey: command.idempotencyKey,
            requestHash: command.requestHash,
          },
          select: attemptSelect,
        });
        const delivery = await transaction.deliveryJob.update({
          where: { merchantId_id: { merchantId, id: deliveryId } },
          data:
            command.result === 'DELIVERED'
              ? { status: 'DELIVERED', deliveredAt: attemptedAt }
              : { status: 'FAILED', failedAt: attemptedAt },
          select: deliverySelect,
        });
        return { delivery, attempt };
      });
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error;
      const replay = await this.database.client.deliveryAttempt.findUnique({
        where: {
          merchantId_idempotencyKey: {
            merchantId,
            idempotencyKey: command.idempotencyKey,
          },
        },
        select: attemptSelect,
      });
      if (
        replay !== null &&
        isExactAttemptReplay(replay, deliveryId, command)
      ) {
        const delivery = await this.find(merchantId, deliveryId);
        if (delivery !== null) return { delivery, attempt: replay };
      }
      throw new DeliveryAttemptIdempotencyConflictError();
    }
  }

  public listAttempts(
    merchantId: string,
    deliveryId: string,
    query: DeliveryAttemptListQuery,
  ): Promise<DeliveryAttemptListResult | null> {
    return this.database.client.$transaction(async (transaction) => {
      const delivery = await transaction.deliveryJob.findFirst({
        where: { merchantId, id: deliveryId },
        select: { id: true },
      });
      if (delivery === null) return null;
      const where = {
        merchantId,
        deliveryJobId: deliveryId,
        ...(query.result === undefined ? {} : { result: query.result }),
        ...(query.failureReason === undefined
          ? {}
          : { failureReason: query.failureReason }),
      };
      const [rows, total] = await Promise.all([
        transaction.deliveryAttempt.findMany({
          where,
          select: attemptSelect,
          orderBy: [{ attemptNumber: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        transaction.deliveryAttempt.count({ where }),
      ]);
      return { rows, total };
    });
  }
}
