-- infra/postgres/init.sql
-- Runs automatically against the crisismap database on first container start.
-- Enables PostGIS so all subsequent Prisma migrations can use geometry columns.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
