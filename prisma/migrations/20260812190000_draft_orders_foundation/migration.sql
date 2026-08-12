CREATE TYPE "order_status" AS ENUM ('DRAFT', 'CONFIRMED', 'FULFILLED', 'COMPLETED', 'ABANDONED', 'CANCELLED');

CREATE UNIQUE INDEX "delivery_locations_merchant_customer_id_key"
ON "delivery_locations"("merchant_id", "customer_id", "id");

CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'DRAFT',
    "customer_name_snapshot" VARCHAR(160),
    "customer_phone_snapshot" VARCHAR(13) NOT NULL,
    "delivery_location_id" UUID,
    "delivery_area_snapshot" VARCHAR(120),
    "delivery_landmark_snapshot" VARCHAR(240),
    "delivery_phone_snapshot" VARCHAR(13),
    "delivery_instructions_snapshot" VARCHAR(500),
    "delivery_map_pin_url_snapshot" VARCHAR(2048),
    "currency" CHAR(3),
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "abandoned_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_customer_phone_snapshot_check" CHECK ("customer_phone_snapshot" ~ '^\+256[0-9]{9}$'),
    CONSTRAINT "orders_customer_name_snapshot_check" CHECK ("customer_name_snapshot" IS NULL OR btrim("customer_name_snapshot") <> ''),
    CONSTRAINT "orders_delivery_snapshot_check" CHECK (
      ("delivery_location_id" IS NULL AND "delivery_area_snapshot" IS NULL AND "delivery_landmark_snapshot" IS NULL AND "delivery_phone_snapshot" IS NULL AND "delivery_instructions_snapshot" IS NULL AND "delivery_map_pin_url_snapshot" IS NULL)
      OR
      ("delivery_location_id" IS NOT NULL AND "delivery_area_snapshot" IS NOT NULL AND btrim("delivery_area_snapshot") <> '' AND "delivery_landmark_snapshot" IS NOT NULL AND btrim("delivery_landmark_snapshot") <> '' AND "delivery_phone_snapshot" ~ '^\+256[0-9]{9}$')
    ),
    CONSTRAINT "orders_currency_check" CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "orders_subtotal_check" CHECK ("subtotal" >= 0 AND (("subtotal" = 0) OR "currency" IS NOT NULL)),
    CONSTRAINT "orders_idempotency_key_check" CHECK ("idempotency_key" ~ '^[!-~]{1,128}$'),
    CONSTRAINT "orders_request_hash_check" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "orders_lifecycle_timestamps_check" CHECK (
      ("status" = 'ABANDONED' AND "abandoned_at" IS NOT NULL AND "cancelled_at" IS NULL)
      OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "abandoned_at" IS NULL)
      OR ("status" NOT IN ('ABANDONED', 'CANCELLED') AND "abandoned_at" IS NULL AND "cancelled_at" IS NULL)
    )
);

CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "product_name_snapshot" VARCHAR(160) NOT NULL,
    "sku_snapshot" VARCHAR(64) NOT NULL,
    "size_snapshot" VARCHAR(80),
    "colour_snapshot" VARCHAR(80),
    "quantity" BIGINT NOT NULL,
    "unit_selling_price" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "line_total" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "order_items_snapshot_text_check" CHECK (btrim("product_name_snapshot") <> '' AND btrim("sku_snapshot") <> ''),
    CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "order_items_unit_selling_price_check" CHECK ("unit_selling_price" > 0),
    CONSTRAINT "order_items_line_total_check" CHECK ("line_total" > 0 AND "line_total" = "quantity" * "unit_selling_price"),
    CONSTRAINT "order_items_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX "orders_merchant_id_id_key" ON "orders"("merchant_id", "id");
CREATE UNIQUE INDEX "orders_merchant_id_idempotency_key_key" ON "orders"("merchant_id", "idempotency_key");
CREATE INDEX "orders_merchant_status_created_id_idx" ON "orders"("merchant_id", "status", "created_at", "id");
CREATE INDEX "orders_merchant_customer_created_id_idx" ON "orders"("merchant_id", "customer_id", "created_at", "id");
CREATE UNIQUE INDEX "order_items_merchant_id_id_key" ON "order_items"("merchant_id", "id");
CREATE UNIQUE INDEX "order_items_merchant_order_variant_key" ON "order_items"("merchant_id", "order_id", "variant_id");
CREATE INDEX "order_items_merchant_order_idx" ON "order_items"("merchant_id", "order_id");
CREATE INDEX "order_items_merchant_variant_idx" ON "order_items"("merchant_id", "variant_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_customer_id_fkey" FOREIGN KEY ("merchant_id", "customer_id") REFERENCES "customers"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_location_fkey" FOREIGN KEY ("merchant_id", "customer_id", "delivery_location_id") REFERENCES "delivery_locations"("merchant_id", "customer_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_merchant_id_order_id_fkey" FOREIGN KEY ("merchant_id", "order_id") REFERENCES "orders"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_merchant_id_variant_id_fkey" FOREIGN KEY ("merchant_id", "variant_id") REFERENCES "product_variants"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
