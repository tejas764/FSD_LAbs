CREATE EXTENSION IF NOT EXISTS postgis;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'building_footprint'
      AND column_name = 'geom'
  ) THEN
    ALTER TABLE "public"."building_footprint"
      ADD COLUMN "geom" geometry(Geometry, 4326);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "building_footprint_geom_gist"
  ON "public"."building_footprint"
  USING GIST ("geom");