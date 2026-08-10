-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(2000),
    "category" VARCHAR(120),
    "brand" VARCHAR(120),
    "status" "product_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_merchant_id_status_idx" ON "products"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "products_merchant_id_name_idx" ON "products"("merchant_id", "name");

-- CreateIndex
CREATE INDEX "products_merchant_id_category_idx" ON "products"("merchant_id", "category");

-- CreateIndex
CREATE INDEX "products_merchant_id_brand_idx" ON "products"("merchant_id", "brand");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
