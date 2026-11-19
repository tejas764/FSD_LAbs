import { PrismaService } from "../prisma/prisma.service";
import { CrisesService } from "./crises.service";
import { CrisisType } from "@prisma/client";
import { ErrorCode } from "../common/error-codes";

function makeMockPrisma() {
  return {
    $queryRawUnsafe: jest.fn(),
    crisis: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
    },
    report: {
      findMany: jest.fn(),
    },
    modularField: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as PrismaService;
}

function makeMockCache() {
  return {
    get: jest.fn(),
    set: jest.fn(),
  };
}

function makeMockFootprintsSource() {
  return {
    fetchByCrisisId: jest.fn(),
  };
}

describe("CrisesService", () => {
  let service: CrisesService;
  let mockPrisma: PrismaService;
  let mockCache: ReturnType<typeof makeMockCache>;
  let mockFootprintsSource: ReturnType<typeof makeMockFootprintsSource>;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    mockCache = makeMockCache();
    mockFootprintsSource = makeMockFootprintsSource();
    service = new CrisesService(
      mockPrisma,
      mockCache as any,
      mockFootprintsSource as any,
    );
  });

  describe("listCrises()", () => {
    it("returns all crises when no filter provided", async () => {
      const mockCrises = [
        { id: "crisis-1", name: "Crisis 1", isActive: true },
        { id: "crisis-2", name: "Crisis 2", isActive: false },
      ];

      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue(mockCrises);

      const result = await service.listCrises({});

      expect(result.status).toBe(200);
      expect(result.body).toEqual(
        mockCrises.map((c) => ({ ...c, extentBBox: null })),
      );
      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: "desc" } }),
      );
    });

    it("filters by active=true when specified", async () => {
      const mockActiveCrises = [
        { id: "crisis-1", name: "Crisis 1", isActive: true },
      ];

      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue(
        mockActiveCrises,
      );

      const result = await service.listCrises({ active: true });

      expect(result.status).toBe(200);
      expect(result.body).toEqual(
        mockActiveCrises.map((c) => ({ ...c, extentBBox: null })),
      );
      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            startedAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("filters by active=false when specified", async () => {
      const mockInactiveCrises = [
        { id: "crisis-2", name: "Crisis 2", isActive: false },
      ];

      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue(
        mockInactiveCrises,
      );

      const result = await service.listCrises({ active: false });

      expect(result.status).toBe(200);
      expect(result.body).toEqual(
        mockInactiveCrises.map((c) => ({ ...c, extentBBox: null })),
      );
      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: false },
          orderBy: { createdAt: "desc" },
        }),
      );
    });

    it("active=true excludes future crises by startedAt", async () => {
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([]);

      await service.listCrises({ active: true });

      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            startedAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it("returns empty array when no crises match", async () => {
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.listCrises({ active: true });

      expect(result.status).toBe(200);
      expect(result.body).toEqual([]);
    });

    it("defaults take to 50 when not specified", async () => {
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([]);

      await service.listCrises({});

      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it("caps take at 50 even when caller requests more", async () => {
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([]);

      await service.listCrises({ take: 200 });

      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });

    it("searches name, country, and region (case-insensitive) when q is provided", async () => {
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([]);

      await service.listCrises({ q: "Syria" });

      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: "Syria", mode: "insensitive" } },
              { country: { contains: "Syria", mode: "insensitive" } },
              { region: { contains: "Syria", mode: "insensitive" } },
            ],
          }),
        }),
      );
    });

    it("matches Syria crisis when q is ISO code 'SY'", async () => {
      const syriaCrisis = { id: "crisis-sy", name: "Damascus Crisis", country: "SY", isActive: true };
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([syriaCrisis]);

      const result = await service.listCrises({ q: "sy" });

      expect(result.status).toBe(200);
      // country OR name OR region search — Prisma would return SY match; verify where shape
      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: "sy", mode: "insensitive" } },
              { country: { contains: "sy", mode: "insensitive" } },
              { region: { contains: "sy", mode: "insensitive" } },
            ],
          }),
        }),
      );
    });

    it("matches crisis by region when q matches region name", async () => {
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([]);

      await service.listCrises({ q: "Aleppo" });

      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { region: { contains: "Aleppo", mode: "insensitive" } },
            ]),
          }),
        }),
      );
    });

    it("filters by country when country is provided", async () => {
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([]);

      await service.listCrises({ country: "SY" });

      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ country: "SY" }),
        }),
      );
    });

    it("filters to crises whose bbox contains the reporter lat/lng", async () => {
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([]);

      await service.listCrises({ lat: 36.2, lng: 37.1 });

      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [
              { extentBBoxMinLat: { lte: 36.2 } },
              { extentBBoxMaxLat: { gte: 36.2 } },
              { extentBBoxMinLng: { lte: 37.1 } },
              { extentBBoxMaxLng: { gte: 37.1 } },
            ],
          }),
        }),
      );
    });

    it("combines lat/lng bbox filter with active filter", async () => {
      (mockPrisma.crisis.findMany as jest.Mock).mockResolvedValue([]);

      await service.listCrises({ active: true, lat: 36.2, lng: 37.1 });

      expect(mockPrisma.crisis.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            AND: expect.arrayContaining([
              expect.objectContaining({ extentBBoxMinLat: expect.any(Object) }),
            ]),
          }),
        }),
      );
    });
  });

  describe("getCrisis()", () => {
    it("returns crisis when found", async () => {
      const mockCrisis = {
        id: "crisis-1",
        name: "Test Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: "Aleppo",
        startedAt: new Date("2024-01-01"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        extentBBoxMinLat: null,
        extentBBoxMinLng: null,
        extentBBoxMaxLat: null,
        extentBBoxMaxLng: null,
      };

      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue(mockCrisis);

      const result = await service.getCrisis("crisis-1");

      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        id: mockCrisis.id,
        name: mockCrisis.name,
        type: mockCrisis.type,
        country: mockCrisis.country,
        region: mockCrisis.region,
        startedAt: mockCrisis.startedAt,
        isActive: mockCrisis.isActive,
        createdAt: mockCrisis.createdAt,
        updatedAt: mockCrisis.updatedAt,
        extentBBox: null,
      });
      expect(mockPrisma.crisis.findUnique).toHaveBeenCalledWith({
        where: { id: "crisis-1" },
      });
    });

    it("response includes extentBBox object when crisis has bbox set", async () => {
      const mockCrisis = {
        id: "crisis-1",
        name: "Test Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2024-01-01"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        extentBBoxMinLat: 36.1,
        extentBBoxMinLng: 36.0,
        extentBBoxMaxLat: 36.3,
        extentBBoxMaxLng: 36.2,
      };

      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue(mockCrisis);

      const result = await service.getCrisis("crisis-1");

      expect(result.status).toBe(200);
      const body = result.body as any;
      expect(body.extentBBox).toEqual([36.0, 36.1, 36.2, 36.3]);
      expect(body.extentBBoxMinLat).toBeUndefined();
      expect(body.extentBBoxMinLng).toBeUndefined();
      expect(body.extentBBoxMaxLat).toBeUndefined();
      expect(body.extentBBoxMaxLng).toBeUndefined();
    });

    it("returns 404 when crisis not found", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getCrisis("nonexistent");

      expect(result.status).toBe(404);
      expect(result.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.CRISIS_NOT_FOUND,
          message: 'Crisis "nonexistent" not found',
        },
      });
    });
  });

  describe("getCrisisFootprints()", () => {
    const crisis = {
      id: "crisis-1",
      name: "Test Crisis",
      type: CrisisType.EARTHQUAKE,
      country: "SY",
      region: "Aleppo",
      startedAt: new Date("2024-01-01"),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const featureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "b1",
          geometry: {
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
          },
          properties: { name: "Building 1" },
        },
      ],
    };

    it("fetches from source and caches on cache miss", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue(crisis);
      mockCache.get.mockResolvedValue(null);
      mockFootprintsSource.fetchByCrisisId.mockResolvedValue(featureCollection);

      const result = await service.getCrisisFootprints("crisis-1");

      expect(result.status).toBe(200);
      expect(result.body).toEqual(featureCollection);
      expect(mockFootprintsSource.fetchByCrisisId).toHaveBeenCalledWith(crisis);
      expect(mockCache.set).toHaveBeenCalledWith(
        "crisis:footprints:crisis-1",
        featureCollection,
        3600,
      );
    });

    it("returns cached payload on cache hit and skips source fetch", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue(crisis);
      mockCache.get.mockResolvedValue(featureCollection);

      const result = await service.getCrisisFootprints("crisis-1");

      expect(result.status).toBe(200);
      expect(result.body).toEqual(featureCollection);
      expect(mockFootprintsSource.fetchByCrisisId).not.toHaveBeenCalled();
    });

    it("returns 404 when crisis id is unknown", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getCrisisFootprints("missing-crisis");

      expect(result.status).toBe(404);
      expect(result.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.CRISIS_NOT_FOUND,
          message: 'Crisis "missing-crisis" not found',
        },
      });
    });

    it("returns safe fallback payload when source is unavailable", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue(crisis);
      mockCache.get.mockResolvedValue(null);
      mockFootprintsSource.fetchByCrisisId.mockRejectedValue(
        new Error("source unavailable"),
      );

      const result = await service.getCrisisFootprints("crisis-1");

      expect(result.status).toBe(200);
      expect(result.body).toEqual({
        type: "FeatureCollection",
        features: [],
        metadata: {
          source: "fallback",
          reason: "LOCAL_FOOTPRINT_SOURCE_UNAVAILABLE",
        },
      });
    });
  });

  describe("getModularSchema()", () => {
    it("returns 404 when crisis id is unknown", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.getModularSchema("missing", {
        infraType: "RESIDENTIAL",
      });

      expect(result.status).toBe(404);
      expect(result.body).toEqual({
        success: false,
        error: {
          code: ErrorCode.CRISIS_NOT_FOUND,
          message: 'Crisis "missing" not found',
        },
      });
    });

    it("returns empty dynamicFields when no modular fields are configured for a crisis", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue({
        id: "flood-crisis",
        type: CrisisType.FLOOD,
      });

      const result = await service.getModularSchema("flood-crisis", {
        infraType: "RESIDENTIAL",
      });

      expect(result.status).toBe(200);
      expect((result.body as any).success).toBe(true);
      expect((result.body as any).data.dynamicFields).toEqual({});
    });

    it("preserves required core fields and does not allow modular removal", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue({
        id: "eq-crisis",
        type: CrisisType.EARTHQUAKE,
      });

      const result = await service.getModularSchema("eq-crisis", {
        infraType: "UTILITY",
      });

      expect(result.status).toBe(200);
      expect((result.body as any).success).toBe(true);
      expect((result.body as any).data.requiredCoreFields).toEqual(
        expect.arrayContaining([
          "infraType",
          "infraName",
          "crisisType",
          "hasDebris",
          "damageLevel",
          "collectedAt",
        ]),
      );
    });

    it("includes labels and placeholders for all 6 UN languages", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue({
        id: "eq-crisis",
        type: CrisisType.EARTHQUAKE,
      });

      const result = await service.getModularSchema("eq-crisis", {
        infraType: "COMMERCIAL",
      });

      const fields = (result.body as any).data.dynamicFields as Record<
        string,
        {
          labels: Record<string, string>;
          placeholders: Record<string, string>;
        }
      >;

      const languages = ["ar", "zh", "en", "fr", "ru", "es"];
      Object.values(fields).forEach((field) => {
        languages.forEach((lang) => {
          expect(field.labels[lang]).toBeDefined();
          expect(field.placeholders[lang]).toBeDefined();
        });
      });
    });

    it("returns human-readable labels — not i18n key placeholders", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: "flood-crisis", type: CrisisType.FLOOD })
        .mockResolvedValueOnce({
          id: "eq-crisis",
          type: CrisisType.EARTHQUAKE,
        });

      const floodResult = await service.getModularSchema("flood-crisis", {
        infraType: "RESIDENTIAL",
      });
      const eqResult = await service.getModularSchema("eq-crisis", {
        infraType: "RESIDENTIAL",
      });

      const allFields = [
        ...Object.values(
          (floodResult.body as any).data.dynamicFields as Record<
            string,
            { labels: Record<string, string> }
          >,
        ),
        ...Object.values(
          (eqResult.body as any).data.dynamicFields as Record<
            string,
            { labels: Record<string, string> }
          >,
        ),
      ];

      allFields.forEach((field) => {
        Object.entries(field.labels).forEach(([lang, value]) => {
          expect(value).not.toMatch(/\.label\.\w+$/);
          expect(value.length).toBeGreaterThan(0);
          // English label must not be an internal key
          if (lang === "en") {
            expect(value).not.toMatch(/^[a-z0-9_]+$/);
          }
        });
      });
    });
  });

  describe("createCrisis()", () => {
    const validPayload = {
      name: "New Crisis",
      type: CrisisType.EARTHQUAKE,
      country: "SY",
      startedAt: new Date("2026-01-01").toISOString(),
    };

    it("returns 400 when name is missing", async () => {
      const result = await service.createCrisis({
        ...validPayload,
        name: undefined,
      });

      expect(result.status).toBe(400);
      if (result.body.success === false) {
        expect(result.body.error.code).toBe("VALIDATION_ERROR");
        expect(result.body.error.message).toContain("name");
      } else {
        fail("Expected error envelope");
      }
    });

    it("returns 400 when type is missing", async () => {
      const result = await service.createCrisis({
        ...validPayload,
        type: undefined,
      });

      expect(result.status).toBe(400);
      if (result.body.success === false) {
        expect(result.body.error.code).toBe("VALIDATION_ERROR");
      } else {
        fail("Expected error envelope");
      }
    });

    it("returns 400 when type is invalid", async () => {
      const result = await service.createCrisis({
        ...validPayload,
        type: "INVALID_TYPE",
      });

      expect(result.status).toBe(400);
      if (result.body.success === false) {
        expect(result.body.error.code).toBe("VALIDATION_ERROR");
      } else {
        fail("Expected error envelope");
      }
    });

    it("returns 400 when country is missing", async () => {
      const result = await service.createCrisis({
        ...validPayload,
        country: undefined,
      });

      expect(result.status).toBe(400);
      if (result.body.success === false) {
        expect(result.body.error.code).toBe("VALIDATION_ERROR");
      } else {
        fail("Expected error envelope");
      }
    });

    it("returns 400 when startedAt is missing", async () => {
      const result = await service.createCrisis({
        ...validPayload,
        startedAt: undefined,
      });

      expect(result.status).toBe(400);
      if (result.body.success === false) {
        expect(result.body.error.code).toBe("VALIDATION_ERROR");
      } else {
        fail("Expected error envelope");
      }
    });

    it("returns 400 when startedAt is invalid datetime", async () => {
      const result = await service.createCrisis({
        ...validPayload,
        startedAt: "invalid-date",
      });

      expect(result.status).toBe(400);
      if (result.body.success === false) {
        expect(result.body.error.code).toBe("VALIDATION_ERROR");
      } else {
        fail("Expected error envelope");
      }
    });

    it("returns 201 with created crisis for valid payload", async () => {
      const mockCreatedCrisis = {
        id: "crisis-new",
        name: "New Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2026-01-01"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        extentBBoxMinLat: null,
        extentBBoxMinLng: null,
        extentBBoxMaxLat: null,
        extentBBoxMaxLng: null,
      };

      (mockPrisma.crisis.create as jest.Mock).mockResolvedValue(
        mockCreatedCrisis,
      );

      const result = await service.createCrisis(validPayload);

      expect(result.status).toBe(201);
      if (result.body.success === true) {
        const data = result.body.data as any;
        expect(data.id).toBe("crisis-new");
        expect(data.extentBBox).toBeNull();
        expect(data.extentBBoxMinLat).toBeUndefined();
      } else {
        fail("Expected success envelope");
      }
      expect(mockPrisma.crisis.create).toHaveBeenCalledWith({
        data: {
          name: "New Crisis",
          type: CrisisType.EARTHQUAKE,
          country: "SY",
          startedAt: new Date("2026-01-01"),
        },
      });
    });

    it("persists extentBBox to 4 columns when provided", async () => {
      const mockCreatedCrisis = {
        id: "crisis-new",
        name: "New Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2026-01-01"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        extentBBoxMinLat: 36.1,
        extentBBoxMinLng: 36.0,
        extentBBoxMaxLat: 36.3,
        extentBBoxMaxLng: 36.2,
      };

      (mockPrisma.crisis.create as jest.Mock).mockResolvedValue(
        mockCreatedCrisis,
      );

      const result = await service.createCrisis({
        ...validPayload,
        extentBBox: [36.0, 36.1, 36.2, 36.3],
      });

      expect(result.status).toBe(201);
      if (result.body.success !== true) fail("Expected success envelope");

      expect(mockPrisma.crisis.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          extentBBoxMinLat: 36.1,
          extentBBoxMinLng: 36.0,
          extentBBoxMaxLat: 36.3,
          extentBBoxMaxLng: 36.2,
        }),
      });

      const data = result.body.data as any;
      expect(data.extentBBox).toEqual([36.0, 36.1, 36.2, 36.3]);
      expect(data.extentBBoxMinLat).toBeUndefined();
    });

    it("returns 400 when extentBBox array has wrong element count", async () => {
      const result = await service.createCrisis({
        ...validPayload,
        extentBBox: [36.0, 36.1, 36.2],
      });

      expect(result.status).toBe(400);
      if (result.body.success !== false) fail("Expected error envelope");
      expect(result.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("includes region in create when provided", async () => {
      const mockCreatedCrisis = {
        id: "crisis-new",
        name: "New Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: "Aleppo",
        startedAt: new Date("2026-01-01"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.crisis.create as jest.Mock).mockResolvedValue(
        mockCreatedCrisis,
      );

      const result = await service.createCrisis({
        ...validPayload,
        region: "Aleppo",
      });

      expect(result.status).toBe(201);
      if (result.body.success === true) {
        expect((result.body.data as { region: string }).region).toBe("Aleppo");
      } else {
        fail("Expected success envelope");
      }
      expect(mockPrisma.crisis.create).toHaveBeenCalledWith({
        data: {
          name: "New Crisis",
          type: CrisisType.EARTHQUAKE,
          country: "SY",
          region: "Aleppo",
          startedAt: new Date("2026-01-01"),
        },
      });
    });

    it("persists endedAt and description when provided", async () => {
      const mockCreatedCrisis = {
        id: "crisis-new",
        name: "New Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2026-01-01"),
        endedAt: new Date("2026-01-10"),
        description: "Temporary shelters damaged",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.crisis.create as jest.Mock).mockResolvedValue(
        mockCreatedCrisis,
      );

      const result = await service.createCrisis({
        ...validPayload,
        endedAt: new Date("2026-01-10").toISOString(),
        description: "Temporary shelters damaged",
      });

      expect(result.status).toBe(201);
      if (result.body.success !== true) fail("Expected success envelope");

      expect(mockPrisma.crisis.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          endedAt: new Date("2026-01-10"),
          description: "Temporary shelters damaged",
        }),
      });
    });
  });

  describe("patchCrisis()", () => {
    it("returns 404 when crisis not found", async () => {
      (mockPrisma.crisis.update as jest.Mock).mockRejectedValue({
        code: "P2025",
      });

      const result = await service.patchCrisis("nonexistent", {
        isActive: false,
      });

      expect(result.status).toBe(404);
      if (result.body.success === false) {
        expect(result.body.error.code).toBe(ErrorCode.CRISIS_NOT_FOUND);
      } else {
        fail("Expected error envelope");
      }
    });

    it("updates isActive field", async () => {
      const mockUpdatedCrisis = {
        id: "crisis-1",
        name: "Test Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2024-01-01"),
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.crisis.update as jest.Mock).mockResolvedValue(
        mockUpdatedCrisis,
      );

      const result = await service.patchCrisis("crisis-1", { isActive: false });

      expect(result.status).toBe(200);
      if (result.body.success === true) {
        const data = result.body.data as any;
        expect(data.isActive).toBe(false);
      } else {
        fail("Expected success envelope");
      }
      expect(mockPrisma.crisis.update).toHaveBeenCalledWith({
        where: { id: "crisis-1" },
        data: { isActive: false },
      });
    });

    it("updates name field", async () => {
      const mockUpdatedCrisis = {
        id: "crisis-1",
        name: "Updated Crisis Name",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2024-01-01"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.crisis.update as jest.Mock).mockResolvedValue(
        mockUpdatedCrisis,
      );

      const result = await service.patchCrisis("crisis-1", {
        name: "Updated Crisis Name",
      });

      expect(result.status).toBe(200);
      if (result.body.success === true) {
        expect((result.body.data as { name: string }).name).toBe(
          "Updated Crisis Name",
        );
      } else {
        fail("Expected success envelope");
      }
    });

    it("updates region field", async () => {
      const mockUpdatedCrisis = {
        id: "crisis-1",
        name: "Test Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: "New Region",
        startedAt: new Date("2024-01-01"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.crisis.update as jest.Mock).mockResolvedValue(
        mockUpdatedCrisis,
      );

      const result = await service.patchCrisis("crisis-1", {
        region: "New Region",
      });

      expect(result.status).toBe(200);
      if (result.body.success === true) {
        expect((result.body.data as { region: string }).region).toBe(
          "New Region",
        );
      } else {
        fail("Expected success envelope");
      }
    });

    it("updates startedAt field", async () => {
      const newDate = new Date("2025-06-15");
      const mockUpdatedCrisis = {
        id: "crisis-1",
        name: "Test Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: newDate,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.crisis.update as jest.Mock).mockResolvedValue(
        mockUpdatedCrisis,
      );

      const result = await service.patchCrisis("crisis-1", {
        startedAt: newDate.toISOString(),
      });

      expect(result.status).toBe(200);
      if (result.body.success === true) {
        expect((result.body.data as { startedAt: Date }).startedAt).toEqual(
          newDate,
        );
      } else {
        fail("Expected success envelope");
      }
    });

    it("ignores type and country fields (immutable)", async () => {
      const mockUpdatedCrisis = {
        id: "crisis-1",
        name: "Test Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2024-01-01"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.crisis.update as jest.Mock).mockResolvedValue(
        mockUpdatedCrisis,
      );

      const result = await service.patchCrisis("crisis-1", {
        isActive: true,
        type: CrisisType.FLOOD,
        country: "TR",
      });

      expect(result.status).toBe(200);
      // Verify that type and country were not passed to update
      expect(mockPrisma.crisis.update).toHaveBeenCalledWith({
        where: { id: "crisis-1" },
        data: { isActive: true },
      });
    });

    it("returns 200 with success envelope", async () => {
      const mockUpdatedCrisis = {
        id: "crisis-1",
        name: "Test Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2024-01-01"),
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        extentBBoxMinLat: null,
        extentBBoxMinLng: null,
        extentBBoxMaxLat: null,
        extentBBoxMaxLng: null,
      };

      (mockPrisma.crisis.update as jest.Mock).mockResolvedValue(
        mockUpdatedCrisis,
      );

      const result = await service.patchCrisis("crisis-1", { isActive: false });

      expect(result.status).toBe(200);
      if (result.body.success === true) {
        expect(result.body.data).toBeDefined();
      } else {
        fail("Expected success envelope");
      }
    });

    it("persists extentBBox to 4 columns when provided", async () => {
      const mockUpdatedCrisis = {
        id: "crisis-1",
        name: "Test Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2024-01-01"),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        extentBBoxMinLat: 36.1,
        extentBBoxMinLng: 36.0,
        extentBBoxMaxLat: 36.3,
        extentBBoxMaxLng: 36.2,
      };

      (mockPrisma.crisis.update as jest.Mock).mockResolvedValue(
        mockUpdatedCrisis,
      );

      const result = await service.patchCrisis("crisis-1", {
        extentBBox: [36.0, 36.1, 36.2, 36.3],
      });

      expect(result.status).toBe(200);
      if (result.body.success !== true) fail("Expected success envelope");

      expect(mockPrisma.crisis.update).toHaveBeenCalledWith({
        where: { id: "crisis-1" },
        data: {
          extentBBoxMinLat: 36.1,
          extentBBoxMinLng: 36.0,
          extentBBoxMaxLat: 36.3,
          extentBBoxMaxLng: 36.2,
        },
      });

      const data = result.body.data as any;
      expect(data.extentBBox).toEqual([36.0, 36.1, 36.2, 36.3]);
      expect(data.extentBBoxMinLat).toBeUndefined();
    });

    it("updates endedAt and description fields", async () => {
      const mockUpdatedCrisis = {
        id: "crisis-1",
        name: "Test Crisis",
        type: CrisisType.EARTHQUAKE,
        country: "SY",
        region: null,
        startedAt: new Date("2024-01-01"),
        endedAt: new Date("2024-01-10"),
        description: "Updated crisis details",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.crisis.update as jest.Mock).mockResolvedValue(
        mockUpdatedCrisis,
      );

      const result = await service.patchCrisis("crisis-1", {
        endedAt: new Date("2024-01-10").toISOString(),
        description: "Updated crisis details",
      });

      expect(result.status).toBe(200);
      expect(mockPrisma.crisis.update).toHaveBeenCalledWith({
        where: { id: "crisis-1" },
        data: {
          endedAt: new Date("2024-01-10"),
          description: "Updated crisis details",
        },
      });
    });
  });

  describe("createModularField()", () => {
    const validPayload = {
      crisisId: "crisis-uuid",
      infraType: "RESIDENTIAL",
      fieldKey: "wall_type",
      fieldType: "string",
      required: false,
    };

    beforeEach(() => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue({
        id: "crisis-uuid",
      });
    });

    it("returns 400 for missing crisisId", async () => {
      const result = await service.createModularField({
        ...validPayload,
        crisisId: "",
      });
      expect(result.status).toBe(400);
    });

    it("returns 400 for invalid fieldKey format", async () => {
      const result = await service.createModularField({
        ...validPayload,
        fieldKey: "Wall Type",
      });
      expect(result.status).toBe(400);
    });

    it("returns 404 when crisis not found", async () => {
      (mockPrisma.crisis.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.createModularField(validPayload);
      expect(result.status).toBe(404);
    });

    it("returns 201 with created field on success", async () => {
      const created = {
        id: "field-uuid",
        ...validPayload,
        labels: null,
        createdAt: new Date(),
      };
      (mockPrisma.modularField.create as jest.Mock).mockResolvedValue(created);
      const result = await service.createModularField(validPayload);
      expect(result.status).toBe(201);
      expect((result.body as any).data.fieldKey).toBe("wall_type");
    });

    it("returns 409 on P2002 duplicate error", async () => {
      (mockPrisma.modularField.create as jest.Mock).mockRejectedValue({
        code: "P2002",
      });
      const result = await service.createModularField(validPayload);
      expect(result.status).toBe(409);
    });
  });

  describe("listModularFields()", () => {
    it("returns 200 with empty array when no fields exist", async () => {
      (mockPrisma.modularField.findMany as jest.Mock).mockResolvedValue([]);
      const result = await service.listModularFields("crisis-uuid");
      expect(result.status).toBe(200);
      expect((result.body as any).data).toEqual([]);
    });

    it("returns 200 with list of fields", async () => {
      const fields = [
        { id: "f1", fieldKey: "wall_type" },
        { id: "f2", fieldKey: "roof_type" },
      ];
      (mockPrisma.modularField.findMany as jest.Mock).mockResolvedValue(fields);
      const result = await service.listModularFields("crisis-uuid");
      expect(result.status).toBe(200);
      expect((result.body as any).data).toHaveLength(2);
    });
  });

  describe("deleteModularField()", () => {
    it("returns 404 when field not found", async () => {
      (mockPrisma.modularField.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.deleteModularField("no-such-id");
      expect(result.status).toBe(404);
    });

    it("returns 204 on successful delete", async () => {
      (mockPrisma.modularField.findUnique as jest.Mock).mockResolvedValue({
        id: "field-uuid",
      });
      (mockPrisma.modularField.delete as jest.Mock).mockResolvedValue({});
      const result = await service.deleteModularField("field-uuid");
      expect(result.status).toBe(204);
    });
  });
});
