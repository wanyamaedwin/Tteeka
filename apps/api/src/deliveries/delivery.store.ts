import type {
  DeliveryAttemptListQuery,
  DeliveryListQuery,
} from './delivery-query.schema';
import type {
  CreateDeliveryInput,
  RecordDeliveryAttemptInput,
} from './delivery.schema';

export const DELIVERY_STORE = Symbol('DELIVERY_STORE');

export type DeliveryJobStatusValue =
  'PENDING' | 'READY' | 'DISPATCHED' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export type DeliveryAttemptResultValue = 'DELIVERED' | 'FAILED';

export type DeliveryFailureReasonValue =
  | 'CUSTOMER_UNREACHABLE'
  | 'CUSTOMER_UNAVAILABLE'
  | 'CUSTOMER_REFUSED'
  | 'WRONG_LOCATION'
  | 'ADDRESS_NOT_FOUND'
  | 'VEHICLE_OR_RIDER_ISSUE'
  | 'WEATHER_OR_ACCESS_ISSUE'
  | 'OTHER';

export interface DeliveryJobRecord {
  readonly id: string;
  readonly merchantId: string;
  readonly orderId: string;
  readonly status: DeliveryJobStatusValue;
  readonly recipientNameSnapshot: string | null;
  readonly recipientPhoneSnapshot: string;
  readonly areaSnapshot: string;
  readonly landmarkSnapshot: string;
  readonly deliveryPhoneSnapshot: string;
  readonly instructionsSnapshot: string | null;
  readonly mapPinUrlSnapshot: string | null;
  readonly requestHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly readyAt: Date | null;
  readonly dispatchedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly failedAt: Date | null;
  readonly cancelledAt: Date | null;
}

export interface DeliveryAttemptRecord {
  readonly id: string;
  readonly merchantId: string;
  readonly deliveryJobId: string;
  readonly attemptNumber: number;
  readonly result: DeliveryAttemptResultValue;
  readonly failureReason: DeliveryFailureReasonValue | null;
  readonly note: string | null;
  readonly attemptedAt: Date;
  readonly requestHash: string;
  readonly createdAt: Date;
}

export interface DeliveryListResult {
  readonly rows: readonly DeliveryJobRecord[];
  readonly total: number;
}

export interface DeliveryAttemptListResult {
  readonly rows: readonly DeliveryAttemptRecord[];
  readonly total: number;
}

export interface CreateDeliveryCommand extends CreateDeliveryInput {
  readonly idempotencyKey: string;
  readonly requestHash: string;
}

export type RecordDeliveryAttemptCommand = RecordDeliveryAttemptInput & {
  readonly idempotencyKey: string;
  readonly requestHash: string;
};

export interface DeliveryStore {
  create(
    merchantId: string,
    command: CreateDeliveryCommand,
  ): Promise<DeliveryJobRecord>;
  list(
    merchantId: string,
    query: DeliveryListQuery,
  ): Promise<DeliveryListResult>;
  find(
    merchantId: string,
    deliveryId: string,
  ): Promise<DeliveryJobRecord | null>;
  transition(
    merchantId: string,
    deliveryId: string,
    target: 'READY' | 'DISPATCHED' | 'CANCELLED',
  ): Promise<DeliveryJobRecord | null>;
  recordAttempt(
    merchantId: string,
    deliveryId: string,
    command: RecordDeliveryAttemptCommand,
  ): Promise<{
    delivery: DeliveryJobRecord;
    attempt: DeliveryAttemptRecord;
  } | null>;
  listAttempts(
    merchantId: string,
    deliveryId: string,
    query: DeliveryAttemptListQuery,
  ): Promise<DeliveryAttemptListResult | null>;
}

export class DeliveryIdempotencyConflictError extends Error {}
export class DeliveryAlreadyExistsError extends Error {}
export class DeliveryOrderUnavailableError extends Error {}
export class DeliveryOrderIneligibleError extends Error {}
export class DeliveryLocationRequiredError extends Error {}
export class DeliveryInvalidTransitionError extends Error {}
export class DeliveryAttemptIdempotencyConflictError extends Error {}
