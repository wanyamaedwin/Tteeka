-- CreateEnum
CREATE TYPE "merchant_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "merchant_membership_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "display_name" VARCHAR(160) NOT NULL,
    "legal_name" VARCHAR(200),
    "phone_e164" VARCHAR(16),
    "email" VARCHAR(320),
    "currency" CHAR(3) NOT NULL DEFAULT 'UGX',
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Kampala',
    "status" "merchant_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "display_name" VARCHAR(160) NOT NULL,
    "phone_e164" VARCHAR(16) NOT NULL,
    "email" VARCHAR(320),
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_memberships" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "merchant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "merchant_membership_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchants_status_idx" ON "merchants"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_e164_key" ON "users"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "merchant_memberships_merchant_id_status_idx" ON "merchant_memberships"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "merchant_memberships_user_id_status_idx" ON "merchant_memberships"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_memberships_merchant_id_user_id_key" ON "merchant_memberships"("merchant_id", "user_id");

-- AddForeignKey
ALTER TABLE "merchant_memberships" ADD CONSTRAINT "merchant_memberships_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_memberships" ADD CONSTRAINT "merchant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
