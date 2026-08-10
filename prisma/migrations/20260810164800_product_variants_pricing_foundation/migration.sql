-- CreateEnum
CREATE TYPE "product_variant_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "barcode" VARCHAR(64),
    "size" VARCHAR(80),
    "colour" VARCHAR(80),
    "status" "product_variant_status" NOT NULL DEFAULT 'INACTIVE',
    "selling_price" BIGINT,
    "cost_price" BIGINT,
    "price_currency" CHAR(3),
    "price_updated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_price_history" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "selling_price" BIGINT NOT NULL,
    "cost_price" BIGINT,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_merchant_id_product_id_sku_id_idx" ON "product_variants"("merchant_id", "product_id", "sku", "id");

-- CreateIndex
CREATE INDEX "product_variants_merchant_id_product_id_status_sku_id_idx" ON "product_variants"("merchant_id", "product_id", "status", "sku", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_merchant_id_id_key" ON "product_variants"("merchant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_merchant_id_sku_key" ON "product_variants"("merchant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_merchant_id_barcode_key" ON "product_variants"("merchant_id", "barcode");

-- CreateIndex
CREATE INDEX "variant_price_history_merchant_id_variant_id_created_at_id_idx" ON "variant_price_history"("merchant_id", "variant_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_merchant_id_id_key" ON "products"("merchant_id", "id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_merchant_id_product_id_fkey" FOREIGN KEY ("merchant_id", "product_id") REFERENCES "products"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_price_history" ADD CONSTRAINT "variant_price_history_merchant_id_variant_id_fkey" FOREIGN KEY ("merchant_id", "variant_id") REFERENCES "product_variants"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
