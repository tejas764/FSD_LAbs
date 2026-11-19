-- F4: Rename PressingNeed enum values to match UNDP Appendix 1 §Q3
-- PostgreSQL does not support renaming or dropping enum values, so the strategy is:
--   1. ADD the new values to the existing enum type
--   2. UPDATE all Report rows to remap old → new values in place
--   3. Old values remain in the DB enum type but no data uses them;
--      the Prisma-generated TypeScript enum (from schema.prisma) does NOT include
--      them, so Zod validation rejects them at the application layer.

-- Step 1: Add new values to the existing PressingNeed enum
ALTER TYPE "PressingNeed" ADD VALUE IF NOT EXISTS 'CASH_ASSISTANCE';
ALTER TYPE "PressingNeed" ADD VALUE IF NOT EXISTS 'HEALTHCARE_MEDICINES';
ALTER TYPE "PressingNeed" ADD VALUE IF NOT EXISTS 'SHELTER_REPAIR';
ALTER TYPE "PressingNeed" ADD VALUE IF NOT EXISTS 'LIVELIHOODS_RESTORATION';
ALTER TYPE "PressingNeed" ADD VALUE IF NOT EXISTS 'BASIC_SERVICES';
ALTER TYPE "PressingNeed" ADD VALUE IF NOT EXISTS 'PROTECTION_PSYCHOSOCIAL';
ALTER TYPE "PressingNeed" ADD VALUE IF NOT EXISTS 'LOCAL_AUTHORITY_SUPPORT';
ALTER TYPE "PressingNeed" ADD VALUE IF NOT EXISTS 'OTHER';

-- Step 2: Remap all existing rows from deprecated values → new values
-- (At this point the enum type contains both old and new values, so the cast is valid.)
UPDATE "Report"
SET "pressingNeeds" = (
  SELECT COALESCE(
    array_agg(
      CASE v::text
        WHEN 'CASH_FINANCIAL'    THEN 'CASH_ASSISTANCE'
        WHEN 'HEALTHCARE'        THEN 'HEALTHCARE_MEDICINES'
        WHEN 'SHELTER'           THEN 'SHELTER_REPAIR'
        WHEN 'LIVELIHOODS'       THEN 'LIVELIHOODS_RESTORATION'
        WHEN 'INFRASTRUCTURE'    THEN 'BASIC_SERVICES'
        WHEN 'PROTECTION'        THEN 'PROTECTION_PSYCHOSOCIAL'
        WHEN 'COMMUNITY_SUPPORT' THEN 'LOCAL_AUTHORITY_SUPPORT'
        ELSE v::text
      END::"PressingNeed"
    ),
    '{}'
  )
  FROM unnest("pressingNeeds") AS v
)
WHERE "pressingNeeds" IS NOT NULL;

-- F4: Add pressingNeedsOther free-text field (optional, max 500 chars enforced by app)
ALTER TABLE "Report" ADD COLUMN "pressingNeedsOther" TEXT;
