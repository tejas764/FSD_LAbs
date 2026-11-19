import type { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { ReportStorageService } from "../reports/report-storage.service";
import { RealtimeFeedService } from "../reports/realtime-feed.service";
import { ReportsExportWorker } from "./reports-export.worker";

jest.mock("@mapbox/shp-write", () => ({
  zip: jest.fn().mockResolvedValue(Buffer.from("mock-shapefile-zip")),
}));

type ReportsExportJobData = {
  crisisId?: string;
  format: "csv" | "geojson" | "shapefile";
  dateFrom?: string;
  dateTo?: string;
  bounds?: string;
};

async function drainUploadContent(content: unknown): Promise<void> {
  if (Buffer.isBuffer(content) || typeof content === "string") {
    return;
  }

  if (
    typeof content === "object" &&
    content !== null &&
    Symbol.asyncIterator in content
  ) {
    for await (const chunk of content as AsyncIterable<unknown>) {
      void chunk;
      // Drain to simulate MinIO consuming the upload stream.
    }
  }
}

describe("ReportsExportWorker", () => {
  let worker: ReportsExportWorker;
  let mockPrisma: PrismaService;
  let mockStorage: ReportStorageService;
  let mockRealtimeFeed: RealtimeFeedService;

  beforeEach(() => {
    mockPrisma = {
      report: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    mockStorage = {
      uploadExportFile: jest.fn().mockImplementation(async ({ content }) => {
        await drainUploadContent(content);
      }),
      createSignedDownloadUrl: jest
        .fn()
        .mockResolvedValue("https://example.com/exports/88.csv?sig=abc"),
    } as unknown as ReportStorageService;

    mockRealtimeFeed = {
      emitExportComplete: jest.fn(),
    } as unknown as RealtimeFeedService;

    worker = new ReportsExportWorker(mockPrisma, mockStorage, mockRealtimeFeed);
  });

  it("should be defined", () => {
    expect(worker).toBeDefined();
  });

  it("closes worker connection on application shutdown", async () => {
    const close = jest.fn().mockResolvedValue(undefined);
    (
      worker as unknown as {
        _worker: {
          close: () => Promise<void>;
        };
      }
    )._worker = { close };

    await worker.onApplicationShutdown();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("does not throw on shutdown when worker is not initialized", async () => {
    await expect(worker.onApplicationShutdown()).resolves.toBeUndefined();
  });

  it("emits export:complete event with download URL after successful csv export", async () => {
    await worker.process({
      id: "88",
      data: { crisisId: "crisis-123", format: "csv" },
    } as unknown as Job<ReportsExportJobData>);

    expect(mockStorage.createSignedDownloadUrl).toHaveBeenCalledWith(
      "exports/88.csv",
      24 * 60 * 60,
    );
    expect(mockRealtimeFeed.emitExportComplete).toHaveBeenCalledWith({
      jobId: "88",
      crisisId: "crisis-123",
      downloadUrl: "https://example.com/exports/88.csv?sig=abc",
    });
  });

  it("emits export:complete event with geojson download URL", async () => {
    (mockStorage.createSignedDownloadUrl as jest.Mock).mockResolvedValue(
      "https://example.com/exports/99.geojson?sig=xyz",
    );

    await worker.process({
      id: "99",
      data: { crisisId: "crisis-456", format: "geojson" },
    } as unknown as Job<ReportsExportJobData>);

    expect(mockStorage.createSignedDownloadUrl).toHaveBeenCalledWith(
      "exports/99.geojson",
      24 * 60 * 60,
    );
    expect(mockRealtimeFeed.emitExportComplete).toHaveBeenCalledWith({
      jobId: "99",
      crisisId: "crisis-456",
      downloadUrl: "https://example.com/exports/99.geojson?sig=xyz",
    });
  });

  it("uploads csv exports as a stream instead of buffering the whole export", async () => {
    await worker.process({
      id: "101",
      data: { crisisId: "crisis-101", format: "csv" },
    } as unknown as Job<ReportsExportJobData>);

    const uploadArg = (mockStorage.uploadExportFile as jest.Mock).mock.calls[0][0] as {
      content: unknown;
    };

    expect(Buffer.isBuffer(uploadArg.content)).toBe(false);
    expect(uploadArg.content).toEqual(
      expect.objectContaining({
        [Symbol.asyncIterator]: expect.any(Function),
      }),
    );
  });

  it("uploads geojson exports as a stream instead of buffering the whole export", async () => {
    await worker.process({
      id: "102",
      data: { crisisId: "crisis-102", format: "geojson" },
    } as unknown as Job<ReportsExportJobData>);

    const uploadArg = (mockStorage.uploadExportFile as jest.Mock).mock.calls[0][0] as {
      content: unknown;
    };

    expect(Buffer.isBuffer(uploadArg.content)).toBe(false);
    expect(uploadArg.content).toEqual(
      expect.objectContaining({
        [Symbol.asyncIterator]: expect.any(Function),
      }),
    );
  });

  it("uploads shapefile export as zip and emits signed download URL", async () => {
    (mockPrisma.report.findMany as jest.Mock).mockResolvedValue([
      {
        id: "report-1",
        crisisId: "crisis-789",
        damageLevel: "PARTIAL",
        infraType: "RESIDENTIAL",
        infraName: "School",
        crisisType: "EARTHQUAKE",
        hasDebris: false,
        collectedAt: new Date("2026-04-03T00:00:00.000Z"),
        description: "Observed damage",
        descriptionLang: "en",
        extraFields: {},
        electricityCondition: "SEVERE_DAMAGE",
        healthServicesFunctioning: "PARTIALLY_FUNCTIONAL",
        pressingNeeds: ["FOOD_WATER"],
        photoKey: "reports/photo-1.jpg",
        thumbnailKey: null,
        latitude: 36.2021,
        longitude: 36.1601,
        buildingId: "building-1",
        locationText: null,
        aiDamageLevel: null,
        aiConfidence: null,
        aiAnalyzedAt: null,
        moderationStatus: "PENDING",
        moderationNote: null,
        moderatedAt: null,
        moderatedBy: null,
        version: 1,
        supersededById: null,
        deviceHash: null,
        ipHash: null,
        isDuplicate: false,
        isVerified: false,
        submittedAt: new Date("2026-04-03T00:00:00.000Z"),
        deletedAt: null,
        createdAt: new Date("2026-04-03T00:00:00.000Z"),
        updatedAt: new Date("2026-04-03T00:00:00.000Z"),
      },
    ]);
    (mockStorage.createSignedDownloadUrl as jest.Mock).mockResolvedValue(
      "https://example.com/exports/100.zip?sig=zip",
    );

    await worker.process({
      id: "100",
      data: { crisisId: "crisis-789", format: "shapefile" },
    } as unknown as Job<ReportsExportJobData>);

    expect(mockStorage.uploadExportFile).toHaveBeenCalledWith(
      expect.objectContaining({
        objectKey: "exports/100.zip",
        contentType: "application/zip",
      }),
    );
    expect(mockStorage.createSignedDownloadUrl).toHaveBeenCalledWith(
      "exports/100.zip",
      24 * 60 * 60,
    );
    expect(mockRealtimeFeed.emitExportComplete).toHaveBeenCalledWith({
      jobId: "100",
      crisisId: "crisis-789",
      downloadUrl: "https://example.com/exports/100.zip?sig=zip",
    });
  });

  it("streams report rows in chunks of 500 with cursor pagination", async () => {
    const buildRow = (id: string) => ({
      id,
      crisisId: "crisis-stream",
      damageLevel: "PARTIAL",
      infraType: "RESIDENTIAL",
      infraName: null,
      crisisType: "EARTHQUAKE",
      hasDebris: false,
      collectedAt: null,
      description: null,
      descriptionLang: "en",
      extraFields: null,
      electricityCondition: "SEVERE_DAMAGE",
      healthServicesFunctioning: "PARTIALLY_FUNCTIONAL",
      pressingNeeds: [],
      photoKey: null,
      thumbnailKey: null,
      latitude: 36.2,
      longitude: 36.16,
      buildingId: null,
      locationText: null,
      aiDamageLevel: null,
      aiConfidence: null,
      aiAnalyzedAt: null,
      moderationStatus: "PENDING",
      moderationNote: null,
      moderatedAt: null,
      moderatedBy: null,
      version: 1,
      supersededById: null,
      deviceHash: null,
      ipHash: null,
      isDuplicate: false,
      isVerified: false,
      submittedAt: new Date("2026-04-04T00:00:00Z"),
      deletedAt: null,
      createdAt: new Date("2026-04-04T00:00:00Z"),
      updatedAt: new Date("2026-04-04T00:00:00Z"),
    });

    const firstChunk = Array.from({ length: 500 }, (_, i) =>
      buildRow(`stream-${i}`),
    );
    const secondChunk = Array.from({ length: 50 }, (_, i) =>
      buildRow(`stream-${500 + i}`),
    );

    (mockPrisma.report.findMany as jest.Mock)
      .mockResolvedValueOnce(firstChunk)
      .mockResolvedValueOnce(secondChunk);

    await worker.process({
      id: "200",
      data: { crisisId: "crisis-stream", format: "csv" },
    } as unknown as Job<ReportsExportJobData>);

    expect(mockPrisma.report.findMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.report.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 500 }),
    );
    expect(mockPrisma.report.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        take: 500,
        cursor: { id: "stream-499" },
        skip: 1,
      }),
    );
  });

  it("does not apply crisisId filter for all-crises export jobs", async () => {
    (mockPrisma.report.findMany as jest.Mock).mockResolvedValue([]);

    await worker.process({
      id: "201",
      data: {
        format: "csv",
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-01-10T00:00:00.000Z",
      },
    } as unknown as Job<ReportsExportJobData>);

    const firstCallArgs = (mockPrisma.report.findMany as jest.Mock).mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(firstCallArgs.where).not.toHaveProperty("crisisId");
  });

  it("parses bounds as minLng,minLat,maxLng,maxLat for export filters", async () => {
    (mockPrisma.report.findMany as jest.Mock).mockResolvedValue([]);

    await worker.process({
      id: "202",
      data: {
        crisisId: "crisis-bounds",
        format: "csv",
        bounds: "110,5,120,10",
      },
    } as unknown as Job<ReportsExportJobData>);

    const firstCallArgs = (mockPrisma.report.findMany as jest.Mock).mock.calls[0][0] as {
      where: {
        latitude?: { gte: number; lte: number };
        longitude?: { gte: number; lte: number };
      };
    };

    expect(firstCallArgs.where.latitude).toEqual({ gte: 5, lte: 10 });
    expect(firstCallArgs.where.longitude).toEqual({ gte: 110, lte: 120 });
  });
});
