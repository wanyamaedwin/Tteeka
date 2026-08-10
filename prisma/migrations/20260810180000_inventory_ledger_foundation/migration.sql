-- CreateEnum
CREATE TYPE "inventory_state" AS ENUM ('AVAILABLE');

-- CreateEnum
CREATE TYPE "inventory_movement_type" AS ENUM ('RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateTable
CREATE TABLE "inventory_balances" (
    "merchant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "state" "inventory_state" NOT NULL,
    "quantity" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("merchant_id", "variant_id", "state"),
    CONSTRAINT "inventory_balances_quantity_check" CHECK ("quantity" >= 0)
);

-- CreateTable
CREATE TABLE "inventory_ledger_entries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "type" "inventory_movement_type" NOT NULL,
    "from_state" "inventory_state",
    "to_state" "inventory_state",
    "quantity" BIGINT NOT NULL,
    "from_state_balance_after" BIGINT,
    "to_state_balance_after" BIGINT,
    "note" VARCHAR(500),
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_ledger_entries_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "inventory_ledger_entries_state_presence_check" CHECK ("from_state" IS NOT NULL OR "to_state" IS NOT NULL),
    CONSTRAINT "inventory_ledger_entries_distinct_states_check" CHECK ("from_state" IS NULL OR "to_state" IS NULL OR "from_state" <> "to_state"),
    CONSTRAINT "inventory_ledger_entries_from_snapshot_check" CHECK (("from_state" IS NULL) = ("from_state_balance_after" IS NULL)),
    CONSTRAINT "inventory_ledger_entries_to_snapshot_check" CHECK (("to_state" IS NULL) = ("to_state_balance_after" IS NULL)),
    CONSTRAINT "inventory_ledger_entries_from_balance_check" CHECK ("from_state_balance_after" IS NULL OR "from_state_balance_after" >= 0),
    CONSTRAINT "inventory_ledger_entries_to_balance_check" CHECK ("to_state_balance_after" IS NULL OR "to_state_balance_after" >= 0),
    CONSTRAINT "inventory_ledger_entries_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_ledger_entries_merchant_id_id_key" ON "inventory_ledger_entries"("merchant_id", "id");
CREATE UNIQUE INDEX "inventory_ledger_entries_merchant_id_idempotency_key_key" ON "inventory_ledger_entries"("merchant_id", "idempotency_key");
CREATE INDEX "inventory_ledger_variant_created_id_idx" ON "inventory_ledger_entries"("merchant_id", "variant_id", "created_at", "id");
CREATE INDEX "inventory_ledger_variant_type_created_id_idx" ON "inventory_ledger_entries"("merchant_id", "variant_id", "type", "created_at", "id");

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_merchant_id_variant_id_fkey" FOREIGN KEY ("merchant_id", "variant_id") REFERENCES "product_variants"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_ledger_entries" ADD CONSTRAINT "inventory_ledger_entries_merchant_id_variant_id_fkey" FOREIGN KEY ("merchant_id", "variant_id") REFERENCES "product_variants"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
