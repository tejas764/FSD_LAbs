-- CreateEnum
CREATE TYPE "public"."BadgeLevel" AS ENUM ('NEWCOMER', 'CONTRIBUTOR', 'TRUSTED', 'EXPERT');

-- CreateTable
CREATE TABLE "public"."ReporterProfile" (
    "reporterId"   TEXT NOT NULL,
    "reportCount"  INTEGER NOT NULL DEFAULT 0,
    "badgeLevel"   "public"."BadgeLevel" NOT NULL DEFAULT 'NEWCOMER',
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReporterProfile_pkey" PRIMARY KEY ("reporterId")
);
