import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type CrisisWithId = {
  id: string;
  extentBBoxMinLat?: number | null;
  extentBBoxMinLng?: number | null;
  extentBBoxMaxLat?: number | null;
  extentBBoxMaxLng?: number | null;
};

type Feature = {
  type: "Feature";
  id: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown[];
  };
  properties: {
    name: string | null;
  };
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: Feature[];
};

@Injectable()
export class FootprintsSourceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async fetchByCrisisId(crisis: CrisisWithId): Promise<FeatureCollection> {
    const boundsRows = await this.prisma.$queryRawUnsafe<
      Array<{
        south: number | null;
        west: number | null;
        north: number | null;
        east: number | null;
      }>
    >(
      `SELECT
        MIN("latitude") as south,
        MIN("longitude") as west,
        MAX("latitude") as north,
        MAX("longitude") as east
      FROM "Report"
      WHERE "crisisId" = $1
        AND "latitude" IS NOT NULL
        AND "longitude" IS NOT NULL`,
      crisis.id,
    );

    const bounds = boundsRows[0];
    let effectiveBounds: {
      south: number;
      west: number;
      north: number;
      east: number;
    } | null = null;

    if (
      bounds &&
      bounds.south !== null &&
      bounds.west !== null &&
      bounds.north !== null &&
      bounds.east !== null
    ) {
      effectiveBounds = {
        south: bounds.south,
        west: bounds.west,
        north: bounds.north,
        east: bounds.east,
      };
    } else if (
      crisis.extentBBoxMinLat != null &&
      crisis.extentBBoxMinLng != null &&
      crisis.extentBBoxMaxLat != null &&
      crisis.extentBBoxMaxLng != null
    ) {
      effectiveBounds = {
        south: crisis.extentBBoxMinLat,
        west: crisis.extentBBoxMinLng,
        north: crisis.extentBBoxMaxLat,
        east: crisis.extentBBoxMaxLng,
      };
    }

    if (!effectiveBounds) {
      return {
        type: "FeatureCollection",
        features: [],
      };
    }

    const footprintRows = await this.prisma.$queryRawUnsafe<
      Array<{
        id: string;
        name: string | null;
        geometry: string;
      }>
    >(
      `SELECT
        id,
        name,
        ST_AsGeoJSON(geom) as geometry
      FROM "building_footprint"
      WHERE geom IS NOT NULL
        AND ST_Intersects(
          geom,
          ST_MakeEnvelope($1, $2, $3, $4, 4326)
        )
      LIMIT 5000`,
      effectiveBounds.west,
      effectiveBounds.south,
      effectiveBounds.east,
      effectiveBounds.north,
    );

    return {
      type: "FeatureCollection",
      features: footprintRows.map((row) => ({
        type: "Feature",
        id: row.id,
        geometry: JSON.parse(row.geometry) as {
          type: "Polygon" | "MultiPolygon";
          coordinates: unknown[];
        },
        properties: {
          name: row.name,
        },
      })),
    };
  }
}
