-- Migration: idempotency key for offline replay safety
ALTER TABLE "public"."Report" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Report_idempotencyKey_key"
  ON "public"."Report"("idempotencyKey");
