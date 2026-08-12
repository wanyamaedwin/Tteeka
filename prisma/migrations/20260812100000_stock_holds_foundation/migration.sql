-- CreateEnum
CREATE TYPE "stock_hold_status" AS ENUM ('ACTIVE', 'RELEASED', 'EXPIRED');

-- CreateTable
CREATE TABLE "stock_holds" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" BIGINT NOT NULL,
    "status" "stock_hold_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "expired_at" TIMESTAMPTZ(3),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stock_holds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_holds_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "stock_holds_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "stock_holds_lifecycle_check" CHECK (
      ("status" = 'ACTIVE' AND "released_at" IS NULL AND "expired_at" IS NULL)
      OR ("status" = 'RELEASED' AND "released_at" IS NOT NULL AND "expired_at" IS NULL)
      OR ("status" = 'EXPIRED' AND "released_at" IS NULL AND "expired_at" IS NOT NULL)
    ),
    CONSTRAINT "stock_holds_expired_at_check" CHECK ("expired_at" IS NULL OR "expired_at" = "expires_at")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_holds_merchant_id_id_key" ON "stock_holds"("merchant_id", "id");
CREATE UNIQUE INDEX "stock_holds_merchant_id_idempotency_key_key" ON "stock_holds"("merchant_id", "idempotency_key");
CREATE INDEX "stock_holds_merchant_variant_status_expiry_idx" ON "stock_holds"("merchant_id", "variant_id", "status", "expires_at");
CREATE INDEX "stock_holds_status_expiry_idx" ON "stock_holds"("status", "expires_at");

-- AddForeignKey
ALTER TABLE "stock_holds" ADD CONSTRAINT "stock_holds_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_holds" ADD CONSTRAINT "stock_holds_merchant_id_variant_id_fkey" FOREIGN KEY ("merchant_id", "variant_id") REFERENCES "product_variants"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
