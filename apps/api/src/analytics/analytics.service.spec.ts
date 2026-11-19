import { PrismaService } from "../prisma/prisma.service";
import { AnalyticsService } from "./analytics.service";

describe("AnalyticsService", () => {
  it("paginates hotspot aggregation in batches of 1000 instead of full table scan", async () => {
    const firstBatch = Array.from({ length: 1000 }, (_, i) => ({
      id: `r-${i}`,
      latitude: 36.2021,
      longitude: 36.1601,
      damageLevel: "PARTIAL" as const,
    }));
    const secondBatch = [
      {
        id: "r-1000",
        latitude: 36.205,
        longitude: 36.165,
        damageLevel: "COMPLETE" as const,
      },
    ];
    const prisma = {
      report: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(firstBatch)
          .mockResolvedValueOnce(secondBatch),
      },
    } as unknown as PrismaService;

    const service = new AnalyticsService(prisma);
    const result = await service.getHotspots({ crisisId: "crisis-paginate" });

    expect(result.success).toBe(true);
    expect(prisma.report.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.report.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 1000 }),
    );
    expect(prisma.report.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 1000,
        cursor: { id: "r-999" },
        skip: 1,
      }),
    );
    // All 1001 reports contributed to the result
    const totalCount = result.data.reduce((sum, h) => sum + h.count, 0);
    expect(totalCount).toBe(1001);
  });

  it("clusters reports into H3 hotspots at resolution 7", async () => {
    const prisma = {
      report: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "r-1",
            latitude: 36.2021,
            longitude: 36.1601,
            damageLevel: "COMPLETE",
          },
          {
            id: "r-2",
            latitude: 36.2022,
            longitude: 36.1602,
            damageLevel: "PARTIAL",
          },
        ]),
      },
    } as unknown as PrismaService;

    const service = new AnalyticsService(prisma);
    const result = await service.getHotspots({ crisisId: "crisis-1" });

    expect(result.success).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        centerLat: expect.any(Number),
        centerLng: expect.any(Number),
        count: expect.any(Number),
        avgDamageLevel: expect.any(Number),
      }),
    );
    expect(prisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          crisisId: "crisis-1",
          isDuplicate: false,
          supersededById: null,
        }),
      }),
    );
  });

  it.each([
    { totalReports: 250000, expectedCalls: 251 },
    { totalReports: 500000, expectedCalls: 501 },
  ])(
    "aggregates $totalReports reports in 1,000-row batches for higher-scale scenarios",
    async ({ totalReports, expectedCalls }) => {
      const batchSize = 1000;
      const findMany = jest.fn().mockImplementation(({ cursor }) => {
        const start = cursor
          ? Number(String((cursor as { id: string }).id).replace("r-", "")) + 1
          : 0;

        if (start >= totalReports) {
          return Promise.resolve([]);
        }

        const size = Math.min(batchSize, totalReports - start);
        return Promise.resolve(
          Array.from({ length: size }, (_, index) => ({
            id: `r-${start + index}`,
            latitude: 36.2021,
            longitude: 36.1601,
            damageLevel: "PARTIAL" as const,
          })),
        );
      });

      const prisma = {
        report: { findMany },
      } as unknown as PrismaService;

      const service = new AnalyticsService(prisma);
      const result = await service.getHotspots({ crisisId: "crisis-scale" });

      expect(result.success).toBe(true);
      const totalCount = result.data.reduce((sum, hotspot) => sum + hotspot.count, 0);
      expect(totalCount).toBe(totalReports);
      expect(findMany).toHaveBeenCalledTimes(expectedCalls);
    },
  );
});

// ─── getSummary ───────────────────────────────────────────────────────────────

describe("AnalyticsService.getSummary", () => {
  function makePrisma(overrides: Partial<ReturnType<typeof buildPrisma>> = {}) {
    return { ...buildPrisma(), ...overrides } as unknown as PrismaService;
  }

  function buildPrisma() {
    return {
      report: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
  }

  it("returns zero summary for a crisis with no reports", async () => {
    const prisma = makePrisma();
    const service = new AnalyticsService(prisma);
    const result = await service.getSummary({ crisisId: "c-empty", period: "7d" });

    expect(result.success).toBe(true);
    expect(result.data.totalReports).toBe(0);
    expect(result.data.pendingModeration).toBe(0);
    expect(result.data.reportsByDay).toEqual([]);
    expect(result.data.byDamageLevel).toEqual({ MINIMAL: 0, PARTIAL: 0, COMPLETE: 0 });
    expect(result.data.byInfraType).toEqual([]);
  });

  it("returns correct totalReports and pendingModeration counts", async () => {
    const prisma = makePrisma({
      report: {
        count: jest
          .fn()
          .mockResolvedValueOnce(42)   // total reports
          .mockResolvedValueOnce(5),   // pending moderation
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });
    const service = new AnalyticsService(prisma as unknown as PrismaService);
    const result = await service.getSummary({ crisisId: "c-1", period: "7d" });

    expect(result.data.totalReports).toBe(42);
    expect(result.data.pendingModeration).toBe(5);
  });

  it("groups byDamageLevel correctly from groupBy results", async () => {
    const prisma = makePrisma({
      report: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest
          .fn()
          // first call: byDamageLevel
          .mockResolvedValueOnce([
            { damageLevel: "MINIMAL", _count: { damageLevel: 10 } },
            { damageLevel: "PARTIAL", _count: { damageLevel: 6 } },
            { damageLevel: "COMPLETE", _count: { damageLevel: 2 } },
          ])
          // second call: byInfraType
          .mockResolvedValueOnce([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });
    const service = new AnalyticsService(prisma as unknown as PrismaService);
    const result = await service.getSummary({ crisisId: "c-2", period: "7d" });

    expect(result.data.byDamageLevel).toEqual({ MINIMAL: 10, PARTIAL: 6, COMPLETE: 2 });
  });

  it("groups byInfraType correctly from groupBy results", async () => {
    const prisma = makePrisma({
      report: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest
          .fn()
          // first call: byDamageLevel
          .mockResolvedValueOnce([])
          // second call: byInfraType
          .mockResolvedValueOnce([
            { infraType: "ROAD", _count: { infraType: 20 } },
            { infraType: "RESIDENTIAL", _count: { infraType: 15 } },
          ]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });
    const service = new AnalyticsService(prisma as unknown as PrismaService);
    const result = await service.getSummary({ crisisId: "c-3", period: "7d" });

    expect(result.data.byInfraType).toEqual([
      { type: "ROAD", count: 20 },
      { type: "RESIDENTIAL", count: 15 },
    ]);
  });

  it("builds reportsByDay from raw query results", async () => {
    const prisma = makePrisma({
      report: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([
        { date: "2026-04-16", count: BigInt(12) },
        { date: "2026-04-17", count: BigInt(5) },
      ]),
    });
    const service = new AnalyticsService(prisma as unknown as PrismaService);
    const result = await service.getSummary({ crisisId: "c-4", period: "7d" });

    expect(result.data.reportsByDay).toEqual([
      { date: "2026-04-16", count: 12 },
      { date: "2026-04-17", count: 5 },
    ]);
  });

  it("scopes the date window correctly for 30d period", async () => {
    const countMock = jest.fn().mockResolvedValue(0);
    const queryRawMock = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      report: { count: countMock, groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: queryRawMock,
    });
    const service = new AnalyticsService(prisma as unknown as PrismaService);

    const before = new Date();
    await service.getSummary({ crisisId: "c-5", period: "30d" });

    // The total-reports count should be called with a dateFrom ~30 days ago
    const firstCountCall = countMock.mock.calls[0][0] as { where: { submittedAt?: { gte: Date } } };
    const gte = firstCountCall.where.submittedAt?.gte;
    expect(gte).toBeInstanceOf(Date);
    const diffDays = (before.getTime() - (gte as Date).getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
  });

  it("omits submittedAt filter for 'all' period", async () => {
    const countMock = jest.fn().mockResolvedValue(0);
    const prisma = makePrisma({
      report: { count: countMock, groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });
    const service = new AnalyticsService(prisma as unknown as PrismaService);
    await service.getSummary({ crisisId: "c-6", period: "all" });

    const firstCountCall = countMock.mock.calls[0][0] as { where: { submittedAt?: unknown } };
    expect(firstCountCall.where.submittedAt).toBeUndefined();
  });

  it("applies duplicate and superseded filters to pendingModeration count", async () => {
    const countMock = jest.fn().mockResolvedValue(0);
    const prisma = makePrisma({
      report: {
        count: countMock,
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });
    const service = new AnalyticsService(prisma as unknown as PrismaService);
    await service.getSummary({ crisisId: "c-7", period: "7d" });

    const pendingWhere = countMock.mock.calls[1][0].where as {
      moderationStatus: string;
      isDuplicate?: boolean;
      supersededById?: null;
      submittedAt?: { gte: Date };
      crisisId?: string;
    };

    expect(pendingWhere.moderationStatus).toBe("PENDING");
    expect(pendingWhere.isDuplicate).toBe(false);
    expect(pendingWhere.supersededById).toBeNull();
    expect(pendingWhere.submittedAt).toBeDefined();
    expect(pendingWhere.crisisId).toBe("c-7");
  });

  it("accepts custom dateFrom and dateTo instead of period", async () => {
    const dateFrom = new Date("2026-03-01");
    const dateTo = new Date("2026-03-31");
    const countMock = jest.fn().mockResolvedValue(10);
    const prisma = makePrisma({
      report: { count: countMock, groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });
    const service = new AnalyticsService(prisma as unknown as PrismaService);

    await service.getSummary({ crisisId: "c-8", dateFrom, dateTo });

    const firstCountCall = countMock.mock.calls[0][0] as { where: { submittedAt?: { gte: Date; lte: Date } } };
    expect(firstCountCall.where.submittedAt?.gte).toEqual(dateFrom);
    expect(firstCountCall.where.submittedAt?.lte).toEqual(dateTo);
  });

  it("applies the same base filters to recentReports query", async () => {
    const dateFrom = new Date("2026-03-01T00:00:00.000Z");
    const dateTo = new Date("2026-03-31T23:59:59.999Z");
    const findManyMock = jest.fn().mockResolvedValue([]);
    const prisma = makePrisma({
      report: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: findManyMock,
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    });

    const service = new AnalyticsService(prisma as unknown as PrismaService);

    await service.getSummary({ crisisId: "c-9", dateFrom, dateTo });

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          crisisId: "c-9",
          isDuplicate: false,
          supersededById: null,
          deletedAt: null,
          submittedAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        }),
        orderBy: { submittedAt: "desc" },
        take: 5,
      }),
    );
  });
});
