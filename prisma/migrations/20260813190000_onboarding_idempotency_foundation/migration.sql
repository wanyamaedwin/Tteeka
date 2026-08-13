CREATE TYPE "onboarding_command_kind" AS ENUM ('REGISTER', 'WORKSPACE');

CREATE TABLE "onboarding_commands" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "kind" "onboarding_command_kind" NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "onboarding_commands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "onboarding_commands_kind_subject_idempotency_key_key"
    ON "onboarding_commands"("kind", "subject", "idempotency_key");
CREATE INDEX "onboarding_commands_user_id_idx" ON "onboarding_commands"("user_id");
CREATE INDEX "onboarding_commands_merchant_id_idx" ON "onboarding_commands"("merchant_id");
