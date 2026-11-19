-- Migration: add PostGIS location geometry column and GIST spatial index on Report
-- The "location" column stores a Point(4326) derived from latitude/longitude.
-- Previously managed as a comment-only stub; this migration materialises it.

-- Ensure PostGIS extension is present (required by shadow DB during migrate dev)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add the geometry column if it does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'Report'
      AND column_name  = 'location'
  ) THEN
    ALTER TABLE "public"."Report"
      ADD COLUMN "location" geometry(Point, 4326);
  END IF;
END $$;

-- Back-fill the geometry column from existing numeric coordinates
UPDATE "public"."Report"
SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)
WHERE "latitude"  IS NOT NULL
  AND "longitude" IS NOT NULL
  AND "location"  IS NULL;

-- Create the GIST spatial index (idempotent)
CREATE INDEX IF NOT EXISTS "report_location_gist"
  ON "public"."Report" USING GIST ("location");
