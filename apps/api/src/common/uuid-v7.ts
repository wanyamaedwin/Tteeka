import { z } from 'zod';

const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uuidV7Schema(message = 'Value must be a UUIDv7 value') {
  return z.string().regex(UUID_V7_PATTERN, message);
}
