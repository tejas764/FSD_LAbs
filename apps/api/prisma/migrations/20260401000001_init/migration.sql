-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."CrisisType" AS ENUM ('EARTHQUAKE', 'FLOOD', 'TSUNAMI', 'HURRICANE_CYCLONE', 'WILDFIRE', 'EXPLOSION', 'CHEMICAL_INCIDENT', 'CONFLICT', 'CIVIL_UNREST');

-- CreateEnum
CREATE TYPE "public"."DamageLevel" AS ENUM ('MINIMAL', 'PARTIAL', 'COMPLETE');

-- CreateEnum
CREATE TYPE "public"."InfraType" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'GOVERNMENT', 'UTILITY', 'TRANSPORT_COMMUNICATION', 'COMMUNITY', 'PUBLIC_RECREATION', 'OTHER');

-- CreateTable
CREATE TABLE "public"."Crisis" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."CrisisType" NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Crisis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Report" (
    "id" TEXT NOT NULL,
    "crisisId" TEXT NOT NULL,
    "damageLevel" "public"."DamageLevel" NOT NULL,
    "infraType" "public"."InfraType" NOT NULL,
    "infraName" TEXT,
    "crisisType" "public"."CrisisType" NOT NULL,
    "hasDebris" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "descriptionLang" TEXT DEFAULT 'en',
    "extraFields" JSONB,
    "photoKey" TEXT NOT NULL,
    "thumbnailKey" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "buildingId" TEXT,
    "locationText" TEXT,
    "aiDamageLevel" "public"."DamageLevel",
    "aiConfidence" DOUBLE PRECISION,
    "aiAnalyzedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersededById" TEXT,
    "deviceHash" TEXT,
    "ipHash" TEXT,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    -- location geometry(Point,4326) column exists in real DB, managed via raw SQL (PostGIS)

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."building_footprint" (
    "id" TEXT NOT NULL,
    -- geometry(Point,4326) column managed via raw SQL (PostGIS)
    "name" TEXT,

    CONSTRAINT "building_footprint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- report_location_gist index on Report.location (geometry column) created via raw SQL;
-- managed outside Prisma migrate.
-- CREATE INDEX "report_location_gist" ON "public"."Report" USING GIST ("location" gist_geometry_ops_2d ASC);

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_crisisId_fkey" FOREIGN KEY ("crisisId") REFERENCES "public"."Crisis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Report" ADD CONSTRAINT "Report_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "public"."Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;
