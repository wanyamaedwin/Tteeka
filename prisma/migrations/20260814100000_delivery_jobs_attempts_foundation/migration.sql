CREATE TYPE "delivery_job_status" AS ENUM (
  'PENDING',
  'READY',
  'DISPATCHED',
  'DELIVERED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "delivery_attempt_result" AS ENUM ('DELIVERED', 'FAILED');

CREATE TYPE "delivery_failure_reason" AS ENUM (
  'CUSTOMER_UNREACHABLE',
  'CUSTOMER_UNAVAILABLE',
  'CUSTOMER_REFUSED',
  'WRONG_LOCATION',
  'ADDRESS_NOT_FOUND',
  'VEHICLE_OR_RIDER_ISSUE',
  'WEATHER_OR_ACCESS_ISSUE',
  'OTHER'
);

CREATE TABLE "delivery_jobs" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "merchant_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "status" "delivery_job_status" NOT NULL DEFAULT 'PENDING',
  "recipient_name_snapshot" VARCHAR(160),
  "recipient_phone_snapshot" VARCHAR(13) NOT NULL,
  "area_snapshot" VARCHAR(120) NOT NULL,
  "landmark_snapshot" VARCHAR(240) NOT NULL,
  "delivery_phone_snapshot" VARCHAR(13) NOT NULL,
  "instructions_snapshot" VARCHAR(500),
  "map_pin_url_snapshot" VARCHAR(2048),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "ready_at" TIMESTAMPTZ(3),
  "dispatched_at" TIMESTAMPTZ(3),
  "delivered_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),

  CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_jobs_recipient_name_check" CHECK ("recipient_name_snapshot" IS NULL OR btrim("recipient_name_snapshot") <> ''),
  CONSTRAINT "delivery_jobs_recipient_phone_check" CHECK ("recipient_phone_snapshot" ~ '^\+256[0-9]{9}$'),
  CONSTRAINT "delivery_jobs_area_check" CHECK (btrim("area_snapshot") <> ''),
  CONSTRAINT "delivery_jobs_landmark_check" CHECK (btrim("landmark_snapshot") <> ''),
  CONSTRAINT "delivery_jobs_delivery_phone_check" CHECK ("delivery_phone_snapshot" ~ '^\+256[0-9]{9}$'),
  CONSTRAINT "delivery_jobs_instructions_check" CHECK ("instructions_snapshot" IS NULL OR btrim("instructions_snapshot") <> ''),
  CONSTRAINT "delivery_jobs_map_pin_url_check" CHECK ("map_pin_url_snapshot" IS NULL OR "map_pin_url_snapshot" ~* '^https?://'),
  CONSTRAINT "delivery_jobs_idempotency_key_check" CHECK ("idempotency_key" ~ '^[!-~]{1,128}$'),
  CONSTRAINT "delivery_jobs_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "delivery_jobs_lifecycle_check" CHECK (
    ("status" = 'PENDING' AND "ready_at" IS NULL AND "dispatched_at" IS NULL AND "delivered_at" IS NULL AND "failed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'READY' AND "ready_at" IS NOT NULL AND "dispatched_at" IS NULL AND "delivered_at" IS NULL AND "failed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'DISPATCHED' AND "ready_at" IS NOT NULL AND "dispatched_at" IS NOT NULL AND "delivered_at" IS NULL AND "failed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'DELIVERED' AND "ready_at" IS NOT NULL AND "dispatched_at" IS NOT NULL AND "delivered_at" IS NOT NULL AND "failed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'FAILED' AND "ready_at" IS NOT NULL AND "dispatched_at" IS NOT NULL AND "delivered_at" IS NULL AND "failed_at" IS NOT NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "dispatched_at" IS NULL AND "delivered_at" IS NULL AND "failed_at" IS NULL AND "cancelled_at" IS NOT NULL)
  )
);

CREATE TABLE "delivery_attempts" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "merchant_id" UUID NOT NULL,
  "delivery_job_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "result" "delivery_attempt_result" NOT NULL,
  "failure_reason" "delivery_failure_reason",
  "note" VARCHAR(500),
  "attempted_at" TIMESTAMPTZ(3) NOT NULL,
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_attempts_number_check" CHECK ("attempt_number" > 0),
  CONSTRAINT "delivery_attempts_result_reason_check" CHECK (
    ("result" = 'DELIVERED' AND "failure_reason" IS NULL)
    OR ("result" = 'FAILED' AND "failure_reason" IS NOT NULL)
  ),
  CONSTRAINT "delivery_attempts_note_check" CHECK ("note" IS NULL OR btrim("note") <> ''),
  CONSTRAINT "delivery_attempts_idempotency_key_check" CHECK ("idempotency_key" ~ '^[!-~]{1,128}$'),
  CONSTRAINT "delivery_attempts_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "delivery_jobs_merchant_id_id_key"
ON "delivery_jobs"("merchant_id", "id");
CREATE UNIQUE INDEX "delivery_jobs_merchant_id_order_id_key"
ON "delivery_jobs"("merchant_id", "order_id");
CREATE UNIQUE INDEX "delivery_jobs_merchant_id_idempotency_key_key"
ON "delivery_jobs"("merchant_id", "idempotency_key");
CREATE INDEX "delivery_jobs_merchant_status_created_id_idx"
ON "delivery_jobs"("merchant_id", "status", "created_at", "id");

CREATE UNIQUE INDEX "delivery_attempts_merchant_id_id_key"
ON "delivery_attempts"("merchant_id", "id");
CREATE UNIQUE INDEX "delivery_attempts_merchant_idempotency_key_key"
ON "delivery_attempts"("merchant_id", "idempotency_key");
CREATE UNIQUE INDEX "delivery_attempts_merchant_job_number_key"
ON "delivery_attempts"("merchant_id", "delivery_job_id", "attempt_number");
CREATE INDEX "delivery_attempts_merchant_job_result_idx"
ON "delivery_attempts"("merchant_id", "delivery_job_id", "result");

ALTER TABLE "delivery_jobs"
ADD CONSTRAINT "delivery_jobs_merchant_id_fkey"
FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "delivery_jobs_merchant_id_order_id_fkey"
FOREIGN KEY ("merchant_id", "order_id") REFERENCES "orders"("merchant_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "delivery_attempts"
ADD CONSTRAINT "delivery_attempts_merchant_id_fkey"
FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "delivery_attempts_merchant_delivery_job_fkey"
FOREIGN KEY ("merchant_id", "delivery_job_id") REFERENCES "delivery_jobs"("merchant_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
