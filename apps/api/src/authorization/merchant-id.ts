import { uuidV7Schema } from '../common/uuid-v7';

export const merchantIdSchema = uuidV7Schema(
  'merchantId must be a UUIDv7 value',
);
