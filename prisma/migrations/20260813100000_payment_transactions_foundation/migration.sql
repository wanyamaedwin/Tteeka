CREATE TYPE "payment_method" AS ENUM ('CASH', 'MTN_MOMO', 'AIRTEL_MONEY');
CREATE TYPE "payment_transaction_status" AS ENUM (
  'REPORTED',
  'VERIFICATION_PENDING',
  'VERIFIED',
  'REJECTED',
  'FAILED',
  'REVERSED',
  'REFUNDED'
);

CREATE TABLE "payment_transactions" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "merchant_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "method" "payment_method" NOT NULL,
  "status" "payment_transaction_status" NOT NULL DEFAULT 'REPORTED',
  "amount" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "payer_phone" VARCHAR(13),
  "provider_reference" VARCHAR(160),
  "merchant_reference" VARCHAR(160),
  "note" VARCHAR(500),
  "reported_at" TIMESTAMPTZ(3) NOT NULL,
  "verification_pending_at" TIMESTAMPTZ(3),
  "verified_at" TIMESTAMPTZ(3),
  "rejected_at" TIMESTAMPTZ(3),
  "failed_at" TIMESTAMPTZ(3),
  "reversed_at" TIMESTAMPTZ(3),
  "refunded_at" TIMESTAMPTZ(3),
  "idempotency_key" VARCHAR(128) NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_transactions_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payment_transactions_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "payment_transactions_idempotency_key_check" CHECK ("idempotency_key" ~ '^[!-~]{1,128}$'),
  CONSTRAINT "payment_transactions_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payment_transactions_method_fields_check" CHECK (
    ("method" = 'CASH' AND "provider_reference" IS NULL)
    OR ("method" IN ('MTN_MOMO', 'AIRTEL_MONEY') AND "payer_phone" IS NOT NULL)
  ),
  CONSTRAINT "payment_transactions_lifecycle_check" CHECK (
    ("status" = 'REPORTED' AND "verification_pending_at" IS NULL AND "verified_at" IS NULL AND "rejected_at" IS NULL AND "failed_at" IS NULL)
    OR ("status" = 'VERIFICATION_PENDING' AND "verification_pending_at" IS NOT NULL AND "verified_at" IS NULL AND "rejected_at" IS NULL AND "failed_at" IS NULL)
    OR ("status" = 'VERIFIED' AND "verified_at" IS NOT NULL AND "rejected_at" IS NULL AND "failed_at" IS NULL)
    OR ("status" = 'REJECTED' AND "rejected_at" IS NOT NULL AND "verified_at" IS NULL AND "failed_at" IS NULL)
    OR ("status" = 'FAILED' AND "failed_at" IS NOT NULL AND "verified_at" IS NULL AND "rejected_at" IS NULL)
    OR ("status" = 'REVERSED' AND "reversed_at" IS NOT NULL)
    OR ("status" = 'REFUNDED' AND "refunded_at" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "payment_transactions_merchant_id_id_key"
ON "payment_transactions"("merchant_id", "id");
CREATE UNIQUE INDEX "payment_transactions_merchant_id_idempotency_key_key"
ON "payment_transactions"("merchant_id", "idempotency_key");
CREATE INDEX "payment_transactions_merchant_order_created_id_idx"
ON "payment_transactions"("merchant_id", "order_id", "created_at", "id");
CREATE INDEX "payment_transactions_merchant_order_status_idx"
ON "payment_transactions"("merchant_id", "order_id", "status");
CREATE INDEX "payment_transactions_merchant_order_method_idx"
ON "payment_transactions"("merchant_id", "order_id", "method");

ALTER TABLE "payment_transactions"
ADD CONSTRAINT "payment_transactions_merchant_id_fkey"
FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "payment_transactions_merchant_id_order_id_fkey"
FOREIGN KEY ("merchant_id", "order_id") REFERENCES "orders"("merchant_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
