ALTER TABLE "orders"
ADD COLUMN "confirmed_at" TIMESTAMPTZ(3),
ADD COLUMN "stock_hold_expires_at" TIMESTAMPTZ(3),
ADD COLUMN "confirmation_idempotency_key" VARCHAR(128),
ADD COLUMN "confirmation_request_hash" CHAR(64);

ALTER TABLE "stock_holds"
ADD COLUMN "order_item_id" UUID;

ALTER TABLE "orders"
ADD CONSTRAINT "orders_confirmation_idempotency_key_check"
CHECK ("confirmation_idempotency_key" IS NULL OR "confirmation_idempotency_key" ~ '^[!-~]{1,128}$'),
ADD CONSTRAINT "orders_confirmation_request_hash_check"
CHECK ("confirmation_request_hash" IS NULL OR "confirmation_request_hash" ~ '^[0-9a-f]{64}$'),
ADD CONSTRAINT "orders_confirmation_metadata_check" CHECK (
  (
    "confirmed_at" IS NULL
    AND "stock_hold_expires_at" IS NULL
    AND "confirmation_idempotency_key" IS NULL
    AND "confirmation_request_hash" IS NULL
  ) OR (
    "confirmed_at" IS NOT NULL
    AND "stock_hold_expires_at" IS NOT NULL
    AND "stock_hold_expires_at" > "confirmed_at"
    AND "confirmation_idempotency_key" IS NOT NULL
    AND "confirmation_request_hash" IS NOT NULL
  )
),
ADD CONSTRAINT "orders_confirmation_status_check" CHECK (
  ("status" IN ('DRAFT', 'ABANDONED') AND "confirmed_at" IS NULL)
  OR ("status" = 'CANCELLED')
  OR ("status" IN ('CONFIRMED', 'FULFILLED', 'COMPLETED') AND "confirmed_at" IS NOT NULL)
);

CREATE UNIQUE INDEX "orders_merchant_confirmation_idempotency_key_key"
ON "orders"("merchant_id", "confirmation_idempotency_key");

CREATE INDEX "stock_holds_merchant_order_item_idx"
ON "stock_holds"("merchant_id", "order_item_id");

ALTER TABLE "stock_holds"
ADD CONSTRAINT "stock_holds_merchant_id_order_item_id_fkey"
FOREIGN KEY ("merchant_id", "order_item_id")
REFERENCES "order_items"("merchant_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
