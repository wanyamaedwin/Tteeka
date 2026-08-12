-- CreateEnum
CREATE TYPE "customer_status" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "delivery_location_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "name" VARCHAR(160),
    "phone" VARCHAR(13) NOT NULL,
    "status" "customer_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customers_phone_check" CHECK ("phone" ~ '^\+256[0-9]{9}$'),
    CONSTRAINT "customers_name_check" CHECK ("name" IS NULL OR btrim("name") <> '')
);

CREATE TABLE "delivery_locations" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "area" VARCHAR(120) NOT NULL,
    "landmark" VARCHAR(240) NOT NULL,
    "phone" VARCHAR(13) NOT NULL,
    "instructions" VARCHAR(500),
    "map_pin_url" VARCHAR(2048),
    "status" "delivery_location_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "delivery_locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_locations_area_check" CHECK (btrim("area") <> ''),
    CONSTRAINT "delivery_locations_landmark_check" CHECK (btrim("landmark") <> ''),
    CONSTRAINT "delivery_locations_phone_check" CHECK ("phone" ~ '^\+256[0-9]{9}$'),
    CONSTRAINT "delivery_locations_instructions_check" CHECK ("instructions" IS NULL OR btrim("instructions") <> ''),
    CONSTRAINT "delivery_locations_map_pin_url_check" CHECK ("map_pin_url" IS NULL OR "map_pin_url" ~* '^https?://')
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_merchant_id_id_key" ON "customers"("merchant_id", "id");
CREATE UNIQUE INDEX "customers_merchant_id_phone_key" ON "customers"("merchant_id", "phone");
CREATE INDEX "customers_merchant_id_status_idx" ON "customers"("merchant_id", "status");
CREATE INDEX "customers_merchant_id_name_idx" ON "customers"("merchant_id", "name");
CREATE UNIQUE INDEX "delivery_locations_merchant_id_id_key" ON "delivery_locations"("merchant_id", "id");
CREATE INDEX "delivery_locations_merchant_customer_status_idx" ON "delivery_locations"("merchant_id", "customer_id", "status");
CREATE INDEX "delivery_locations_merchant_customer_created_id_idx" ON "delivery_locations"("merchant_id", "customer_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_locations" ADD CONSTRAINT "delivery_locations_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_locations" ADD CONSTRAINT "delivery_locations_merchant_id_customer_id_fkey" FOREIGN KEY ("merchant_id", "customer_id") REFERENCES "customers"("merchant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
