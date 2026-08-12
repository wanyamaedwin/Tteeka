import { createHash } from 'node:crypto';

import type {
  CreateDeliveryInput,
  RecordDeliveryAttemptInput,
} from './delivery.schema';

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function deliveryCreateRequestHash(input: CreateDeliveryInput): string {
  return sha256({ orderId: input.orderId });
}

export function deliveryAttemptRequestHash(
  deliveryJobId: string,
  input: RecordDeliveryAttemptInput,
): string {
  return sha256({
    deliveryJobId,
    result: input.result,
    failureReason: input.failureReason,
    note: input.note,
  });
}
