/*
  Warnings:

  - Added the required column `electricityCondition` to the `Report` table without a default value. This is not possible if the table is not empty.
  - Added the required column `healthServicesFunctioning` to the `Report` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ElectricityCondition" AS ENUM ('NO_DAMAGE', 'MINOR_DAMAGE', 'MODERATE_DAMAGE', 'SEVERE_DAMAGE', 'COMPLETELY_DESTROYED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HealthServicesFunctioning" AS ENUM ('FULLY_FUNCTIONAL', 'PARTIALLY_FUNCTIONAL', 'LARGELY_DISRUPTED', 'NOT_FUNCTIONING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PressingNeed" AS ENUM ('FOOD_WATER', 'CASH_FINANCIAL', 'HEALTHCARE', 'SHELTER', 'LIVELIHOODS', 'WASH', 'INFRASTRUCTURE', 'PROTECTION', 'COMMUNITY_SUPPORT');

-- AlterTable — add WITH DEFAULT so existing seed rows get a value, then drop default
ALTER TABLE "Report"
  ADD COLUMN "electricityCondition" "ElectricityCondition" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "healthServicesFunctioning" "HealthServicesFunctioning" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "pressingNeeds" "PressingNeed"[];

ALTER TABLE "Report"
  ALTER COLUMN "electricityCondition" DROP DEFAULT,
  ALTER COLUMN "healthServicesFunctioning" DROP DEFAULT;
