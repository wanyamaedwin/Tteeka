CREATE TYPE "payment_verification_source" AS ENUM ('MANUAL', 'PROVIDER');
CREATE TYPE "payment_provider" AS ENUM ('MTN_MOMO', 'AIRTEL_MONEY');
CREATE TYPE "payment_verification_attempt_status" AS ENUM (
  'PENDING',
  'VERIFIED',
  'NOT_VERIFIED',
  'FAILED'
);

ALTER TABLE "payment_transactions"
ADD COLUMN "verification_source" "payment_verification_source";

UPDATE "payment_transactions"
SET "verification_source" = 'MANUAL'
WHERE "status" = 'VERIFIED';

ALTER TABLE "payment_transactions"
ADD CONSTRAINT "payment_transactions_verification_source_check" CHECK (
  ("status" = 'VERIFIED' AND "verification_source" IS NOT NULL)
  OR ("status" IN ('REVERSED', 'REFUNDED'))
  OR ("status" NOT IN ('VERIFIED', 'REVERSED', 'REFUNDED') AND "verification_source" IS NULL)
);

CREATE TABLE "payment_verification_attempts" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "merchant_id" UUID NOT NULL,
  "payment_transaction_id" UUID NOT NULL,
  "provider" "payment_provider" NOT NULL,
  "status" "payment_verification_attempt_status" NOT NULL DEFAULT 'PENDING',
  "provider_reference_snapshot" VARCHAR(160),
  "payer_phone_snapshot" VARCHAR(13) NOT NULL,
  "amount_snapshot" BIGINT NOT NULL,
  "currency_snapshot" CHAR(3) NOT NULL,
  "provider_transaction_id" VARCHAR(160),
  "provider_status_code" VARCHAR(80),
  "provider_status_text" VARCHAR(240),
  "failure_code" VARCHAR(80),
  "failure_message" VARCHAR(500),
  "requested_at" TIMESTAMPTZ(3) NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "payment_verification_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_verification_attempts_amount_check" CHECK ("amount_snapshot" > 0),
  CONSTRAINT "payment_verification_attempts_currency_check" CHECK ("currency_snapshot" ~ '^[A-Z]{3}$'),
  CONSTRAINT "payment_verification_attempts_phone_check" CHECK ("payer_phone_snapshot" ~ '^\+256[0-9]{9}$'),
  CONSTRAINT "payment_verification_attempts_idempotency_key_check" CHECK ("idempotency_key" ~ '^[!-~]{1,128}$'),
  CONSTRAINT "payment_verification_attempts_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payment_verification_attempts_lifecycle_check" CHECK (
    (
      "status" = 'PENDING'
      AND "completed_at" IS NULL
      AND "provider_transaction_id" IS NULL
      AND "provider_status_code" IS NULL
      AND "provider_status_text" IS NULL
      AND "failure_code" IS NULL
      AND "failure_message" IS NULL
    )
    OR (
      "status" IN ('VERIFIED', 'NOT_VERIFIED')
      AND "completed_at" IS NOT NULL
      AND "failure_code" IS NULL
      AND "failure_message" IS NULL
    )
    OR (
      "status" = 'FAILED'
      AND "completed_at" IS NOT NULL
      AND "failure_code" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "payment_verification_attempts_merchant_id_id_key"
ON "payment_verification_attempts"("merchant_id", "id");
CREATE UNIQUE INDEX "payment_verification_attempts_merchant_idempotency_key_key"
ON "payment_verification_attempts"("merchant_id", "idempotency_key");
CREATE INDEX "payment_verification_attempts_merchant_payment_created_id_idx"
ON "payment_verification_attempts"("merchant_id", "payment_transaction_id", "created_at", "id");
CREATE INDEX "payment_verification_attempts_merchant_payment_status_idx"
ON "payment_verification_attempts"("merchant_id", "payment_transaction_id", "status");

ALTER TABLE "payment_verification_attempts"
ADD CONSTRAINT "payment_verification_attempts_merchant_id_fkey"
FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "payment_verification_attempts_merchant_payment_fkey"
FOREIGN KEY ("merchant_id", "payment_transaction_id")
REFERENCES "payment_transactions"("merchant_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
