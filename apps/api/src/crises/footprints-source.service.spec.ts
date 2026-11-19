import { FootprintsSourceService } from "./footprints-source.service";
import { PrismaService } from "../prisma/prisma.service";

function makeMockPrisma() {
  return {
    $queryRawUnsafe: jest.fn(),
  } as unknown as PrismaService;
}

describe("FootprintsSourceService", () => {
  let service: FootprintsSourceService;
  let mockPrisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new FootprintsSourceService(mockPrisma as PrismaService);
  });

  describe("fetchByCrisisId()", () => {
    const buildingRow = {
      id: "building-1",
      name: "Test Building",
      geometry: JSON.stringify({
        type: "Polygon",
        coordinates: [
          [
            [36.0, 36.0],
            [36.1, 36.0],
            [36.1, 36.1],
            [36.0, 36.1],
            [36.0, 36.0],
          ],
        ],
      }),
    };

    it("returns empty FeatureCollection when no reports and no extentBBox", async () => {
      (mockPrisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { south: null, west: null, north: null, east: null },
      ]);

      const crisis = {
        id: "crisis-1",
        extentBBoxMinLat: null,
        extentBBoxMinLng: null,
        extentBBoxMaxLat: null,
        extentBBoxMaxLng: null,
      };

      const result = await service.fetchByCrisisId(crisis);

      expect(result.type).toBe("FeatureCollection");
      expect(result.features).toHaveLength(0);
      // should NOT make second query to building_footprint
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it("uses crisis extentBBox as fallback bounds when no reports", async () => {
      (mockPrisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([
          { south: null, west: null, north: null, east: null },
        ])
        .mockResolvedValueOnce([buildingRow]);

      const crisis = {
        id: "crisis-1",
        extentBBoxMinLat: 36.0,
        extentBBoxMinLng: 36.1,
        extentBBoxMaxLat: 36.2,
        extentBBoxMaxLng: 36.3,
      };

      const result = await service.fetchByCrisisId(crisis);

      expect(result.type).toBe("FeatureCollection");
      expect(result.features).toHaveLength(1);
      expect(result.features[0].id).toBe("building-1");

      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(2);
      // ST_MakeEnvelope(west, south, east, north) = (minLng, minLat, maxLng, maxLat)
      const secondCall = (mockPrisma.$queryRawUnsafe as jest.Mock).mock
        .calls[1];
      expect(secondCall[1]).toBe(36.1); // west = minLng
      expect(secondCall[2]).toBe(36.0); // south = minLat
      expect(secondCall[3]).toBe(36.3); // east = maxLng
      expect(secondCall[4]).toBe(36.2); // north = maxLat
    });

    it("uses report bounds when reports exist and ignores extentBBox", async () => {
      (mockPrisma.$queryRawUnsafe as jest.Mock)
        .mockResolvedValueOnce([
          { south: 36.1, west: 36.11, north: 36.15, east: 36.16 },
        ])
        .mockResolvedValueOnce([]);

      const crisis = {
        id: "crisis-1",
        extentBBoxMinLat: 36.0,
        extentBBoxMinLng: 36.0,
        extentBBoxMaxLat: 36.9,
        extentBBoxMaxLng: 36.9,
      };

      await service.fetchByCrisisId(crisis);

      const secondCall = (mockPrisma.$queryRawUnsafe as jest.Mock).mock
        .calls[1];
      // west = bounds.west = 36.11, south = bounds.south = 36.1
      expect(secondCall[1]).toBe(36.11);
      expect(secondCall[2]).toBe(36.1);
      expect(secondCall[3]).toBe(36.16);
      expect(secondCall[4]).toBe(36.15);
    });

    it("returns empty FeatureCollection when no reports and extentBBox missing (undefined)", async () => {
      (mockPrisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([
        { south: null, west: null, north: null, east: null },
      ]);

      // crisis without extentBBox columns (e.g. older mock)
      const crisis = { id: "crisis-1" };

      const result = await service.fetchByCrisisId(crisis as any);

      expect(result.type).toBe("FeatureCollection");
      expect(result.features).toHaveLength(0);
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });
  });
});
