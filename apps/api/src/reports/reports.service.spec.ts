import { ConfigService } from "@nestjs/config";
import { ModerationStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { QueueService } from "../queue/queue.service";
import { PhotoProcessingService } from "./photo-processing.service";
import { RealtimeFeedService } from "./realtime-feed.service";
import { ReportStorageService } from "./report-storage.service";
import { ReportsService, type UploadedPhoto } from "./reports.service";
import { ReporterService } from "../reporter/reporter.service";

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    crisisId: "crisis-1",
    damageLevel: "PARTIAL",
    infraType: "RESIDENTIAL",
    infraName: "School",
    crisisType: "EARTHQUAKE",
    hasDebris: "false",
    collectedAt: new Date().toISOString(),
    description: "Observed damage",
    electricityCondition: "SEVERE_DAMAGE",
    healthServicesFunctioning: "PARTIALLY_FUNCTIONAL",
    pressingNeeds: JSON.stringify(["FOOD_WATER", "SHELTER_REPAIR"]),
    extraFields: {},
    latitude: "36.2021",
    longitude: "36.1601",
    ...overrides,
  };
}

function makeMockPrisma(
  reportOverrides: Record<string, unknown> = {},
  crisisOverrides: Record<string, unknown> = {},
) {
  const reportCreate = jest.fn().mockResolvedValue({
    id: "db-report-id",
    isDuplicate: false,
    version: 1,
    ...reportOverrides,
  });

  const reportFindFirst = jest.fn().mockResolvedValue(null);
  const reportUpdate = jest.fn().mockResolvedValue({});
  const reportFindUnique = jest.fn().mockResolvedValue({
    id: "db-report-id",
    crisisId: "crisis-1",
    buildingId: null,
  });
  const reportFindMany = jest.fn().mockResolvedValue([]);
  const reportCount = jest.fn().mockResolvedValue(0);

  return {
    report: {
      create: reportCreate,
      findFirst: reportFindFirst,
      update: reportUpdate,
      findUnique: reportFindUnique,
      findMany: reportFindMany,
      count: reportCount,
    },
    crisis: {
      findUnique: jest.fn().mockResolvedValue({
        id: "crisis-1",
        name: "Test Crisis",
        isActive: true,
        ...crisisOverrides,
      }),
    },
  } as unknown as PrismaService;
}

describe("ReportsService", () => {
  let service: ReportsService;
  let mockPrisma: PrismaService;
  let mockConfig: ConfigService;
  let mockPhotoProcessing: PhotoProcessingService;
  let mockStorage: ReportStorageService;
  let mockQueue: QueueService;
  let mockRealtimeFeed: RealtimeFeedService;
  let mockReporterService: ReporterService;

  const validPhoto: UploadedPhoto = {
    fieldname: "photo",
    originalname: "photo.jpg",
    encoding: "7bit",
    mimetype: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff]),
  } as unknown as UploadedPhoto;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    mockConfig = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) =>
          key === "STORAGE_PUBLIC_URL"
            ? "http://localhost:9000/crisismap-reports"
            : defaultValue,
        ),
    } as unknown as ConfigService;
    mockPhotoProcessing = {
      stripExif: jest.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    } as unknown as PhotoProcessingService;
    mockStorage = {
      uploadReportPhoto: jest.fn().mockResolvedValue({
        photoKey: "reports/crisis-1/photo.jpg",
        thumbnailKey: null,
      }),
    } as unknown as ReportStorageService;
    mockQueue = {
      enqueueAiClassification: jest.fn().mockResolvedValue({ id: "ai-job-id" }),
      enqueueTranslation: jest
        .fn()
        .mockResolvedValue({ id: "translation-job-id" }),
    } as unknown as QueueService;
    mockRealtimeFeed = {
      emitReportUpdate: jest.fn(),
    } as unknown as RealtimeFeedService;
    mockReporterService = {
      upsertProfile: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReporterService;
    service = new ReportsService(
      mockPrisma,
      mockConfig,
      mockPhotoProcessing,
      mockStorage,
      mockQueue,
      mockRealtimeFeed,
      mockReporterService,
    );
  });

  it("returns 400 validation error when location is missing", async () => {
    const response = await service.submit(
      validPayload({
        latitude: undefined,
        longitude: undefined,
        locationText: undefined,
      }),
      validPhoto,
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toContain("location");
    }
  });

  it("returns 201 with response metadata for valid payload", async () => {
    const response = await service.submit(validPayload(), validPhoto);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    if (response.body.success === true) {
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.photoUrl).toContain(
        "reports/crisis-1/photo.jpg",
      );
      expect(response.body.data.acknowledgment).toContain("Report received");
    }
  });

  it("enqueues translation with empty text when description is omitted", async () => {
    const response = await service.submit(
      validPayload({ description: undefined }),
      validPhoto,
    );

    expect(response.status).toBe(201);
    expect(mockQueue.enqueueTranslation).toHaveBeenCalledTimes(6);
    expect(mockQueue.enqueueTranslation).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      "",
      "ar",
    );
    expect(
      (mockQueue.enqueueTranslation as jest.Mock).mock.calls.every(
        (call: unknown[]) => call[1] === "",
      ),
    ).toBe(true);
  });

  it("persists the report to the database and returns the DB-generated id", async () => {
    const response = await service.submit(validPayload(), validPhoto);

    expect(mockPrisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          crisisId: "crisis-1",
          damageLevel: "PARTIAL",
          infraType: "RESIDENTIAL",
          crisisType: "EARTHQUAKE",
          hasDebris: false,
          latitude: 36.2021,
          longitude: 36.1601,
          photoKey: "reports/crisis-1/photo.jpg",
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    if (response.body.success === true) {
      expect(response.body.data.id).toBe("db-report-id");
    }
  });

  it("returns 409 when crisis is not active", async () => {
    mockPrisma = makeMockPrisma({}, { isActive: false });
    service = new ReportsService(
      mockPrisma,
      mockConfig,
      mockPhotoProcessing,
      mockStorage,
      mockQueue,
      mockRealtimeFeed,
    );

    const response = await service.submit(validPayload(), validPhoto);

    expect(response.status).toBe(409);
    expect(response.body.success).toBe(false);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("CRISIS_NOT_ACTIVE");
      expect(response.body.error.message).toContain("not accepting");
    }
  });

  it("succeeds when crisis is active", async () => {
    mockPrisma = makeMockPrisma({}, { isActive: true });
    service = new ReportsService(
      mockPrisma,
      mockConfig,
      mockPhotoProcessing,
      mockStorage,
      mockQueue,
      mockRealtimeFeed,
    );

    const response = await service.submit(validPayload(), validPhoto);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("returns 400 validation error when photo is missing", async () => {
    const response = await service.submit(validPayload(), undefined);

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toContain("photo");
    }
  });

  // ── UNDP Appendix 1 mandatory questions ───────────────────────────────────

  it("returns 400 when electricityCondition is missing", async () => {
    const response = await service.submit(
      validPayload({ electricityCondition: undefined }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 400 when electricityCondition has an invalid value", async () => {
    const response = await service.submit(
      validPayload({ electricityCondition: "TOTALLY_FINE" }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 400 when healthServicesFunctioning is missing", async () => {
    const response = await service.submit(
      validPayload({ healthServicesFunctioning: undefined }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 400 when healthServicesFunctioning has an invalid value", async () => {
    const response = await service.submit(
      validPayload({ healthServicesFunctioning: "GREAT" }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 400 when pressingNeeds is missing", async () => {
    const response = await service.submit(
      validPayload({ pressingNeeds: undefined }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 400 when pressingNeeds is an empty array", async () => {
    const response = await service.submit(
      validPayload({ pressingNeeds: JSON.stringify([]) }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 400 when pressingNeeds contains an invalid value", async () => {
    const response = await service.submit(
      validPayload({ pressingNeeds: JSON.stringify(["DIAMONDS"]) }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("persists electricityCondition, healthServicesFunctioning, pressingNeeds to DB", async () => {
    await service.submit(validPayload(), validPhoto);

    expect(mockPrisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          electricityCondition: "SEVERE_DAMAGE",
          healthServicesFunctioning: "PARTIALLY_FUNCTIONAL",
          pressingNeeds: ["FOOD_WATER", "SHELTER_REPAIR"],
        }),
      }),
    );
  });

  it("lists reports as GeoJSON and excludes duplicates/superseded by default", async () => {
    (
      mockPrisma as unknown as { report: { findMany: jest.Mock } }
    ).report.findMany = jest.fn().mockResolvedValue([
      {
        id: "r-1",
        crisisId: "crisis-1",
        damageLevel: "PARTIAL",
        latitude: 36.2,
        longitude: 36.16,
        submittedAt: new Date("2026-01-01T10:00:00.000Z"),
        isDuplicate: false,
        supersededById: null,
      },
    ]);
    (
      mockPrisma as unknown as { report: { count: jest.Mock } }
    ).report.count = jest.fn().mockResolvedValue(87);

    const response = await service.listReportsGeoJson({
      crisisId: "crisis-1",
    });

    expect(response.type).toBe("FeatureCollection");
    expect(response.features).toHaveLength(1);
    expect(response.features[0].id).toBe("r-1");
    expect(response.meta.total).toBe(87);
    expect(
      (mockPrisma as unknown as { report: { findMany: jest.Mock } }).report
        .findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          crisisId: "crisis-1",
          isDuplicate: false,
          supersededById: null,
          deletedAt: null,
        }),
        take: 1001,
      }),
    );
    expect(
      (mockPrisma as unknown as { report: { count: jest.Mock } }).report.count,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          crisisId: "crisis-1",
          isDuplicate: false,
          supersededById: null,
          deletedAt: null,
        }),
      }),
    );
  });

  it("includes moderationStatus in GeoJSON properties", async () => {
    (
      mockPrisma as unknown as { report: { findMany: jest.Mock } }
    ).report.findMany = jest.fn().mockResolvedValue([
      {
        id: "r-2",
        crisisId: "crisis-1",
        damageLevel: "PARTIAL",
        latitude: 36.2,
        longitude: 36.16,
        submittedAt: new Date("2026-01-01T10:00:00.000Z"),
        isDuplicate: false,
        supersededById: null,
        moderationStatus: ModerationStatus.APPROVED,
        infraType: "RESIDENTIAL",
        infraName: null,
        crisisType: "FLOOD",
        locationText: "Near market",
      },
    ]);

    const response = await service.listReportsGeoJson({
      crisisId: "crisis-1",
    });

    expect(response.features[0].properties.moderationStatus).toBe(
      ModerationStatus.APPROVED,
    );
  });

  it("filters by pending moderation status", async () => {
    (
      mockPrisma as unknown as { report: { findMany: jest.Mock; count: jest.Mock } }
    ).report.findMany = jest.fn().mockResolvedValue([]);
    (
      mockPrisma as unknown as { report: { findMany: jest.Mock; count: jest.Mock } }
    ).report.count = jest.fn().mockResolvedValue(0);

    await service.listReportsGeoJson({
      crisisId: "crisis-1",
      moderationStatus: ModerationStatus.PENDING,
    });

    expect(
      (mockPrisma as unknown as { report: { findMany: jest.Mock } }).report
        .findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              moderationStatus: ModerationStatus.PENDING,
            }),
          ]),
        }),
      }),
    );

    expect(
      (mockPrisma as unknown as { report: { count: jest.Mock } }).report.count,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              moderationStatus: ModerationStatus.PENDING,
            }),
          ]),
        }),
      }),
    );
  });

  it("creates an export job and returns a job id", async () => {
    mockQueue = {
      ...mockQueue,
      enqueueReportsExport: jest.fn().mockResolvedValue({ id: "job-123" }),
    } as unknown as QueueService;
    service = new ReportsService(
      mockPrisma,
      mockConfig,
      mockPhotoProcessing,
      mockStorage,
      mockQueue,
      mockRealtimeFeed,
    );

    const result = await service.createExportJob({
      crisisId: "crisis-1",
      format: "csv",
    });

    expect(result).toEqual({ jobId: "job-123" });
    expect(
      (
        mockQueue as unknown as {
          enqueueReportsExport: jest.Mock;
        }
      ).enqueueReportsExport,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ crisisId: "crisis-1", format: "csv" }),
    );
  });

  it("increments version and supersedes previous primary report for same building", async () => {
    const existingPrimary = {
      id: "old-report-id",
      version: 2,
    };

    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
      }
    ).report.findFirst
      .mockResolvedValueOnce(existingPrimary)
      .mockResolvedValueOnce(null);

    (
      mockPrisma as unknown as { report: { create: jest.Mock } }
    ).report.create.mockResolvedValue({
      id: "new-report-id",
      isDuplicate: false,
      version: 3,
    });

    const response = await service.submit(
      validPayload({
        buildingId: "building-1",
      }),
      validPhoto,
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(
      (
        mockPrisma as unknown as {
          report: { create: jest.Mock };
        }
      ).report.create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          buildingId: "building-1",
          version: 3,
          isDuplicate: false,
        }),
      }),
    );
    expect(
      (
        mockPrisma as unknown as {
          report: { update: jest.Mock };
        }
      ).report.update,
    ).toHaveBeenCalledWith({
      where: { id: "old-report-id" },
      data: { supersededById: "new-report-id" },
    });
  });

  it("flags probable duplicates and does not supersede previous report", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
      }
    ).report.findFirst.mockResolvedValueOnce({
      id: "nearby-report",
    });

    await service.submit(
      validPayload({
        latitude: "36.2021",
        longitude: "36.1601",
      }),
      validPhoto,
    );

    expect(
      (
        mockPrisma as unknown as {
          report: { create: jest.Mock };
        }
      ).report.create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDuplicate: true,
        }),
      }),
    );

    expect(
      (
        mockPrisma as unknown as {
          report: { update: jest.Mock };
        }
      ).report.update,
    ).not.toHaveBeenCalled();
  });

  it("marks second same-location submission as duplicate when submitted within one hour", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; create: jest.Mock };
      }
    ).report.findFirst
      .mockResolvedValueOnce(null) // first submit: duplicate check → not a dup
      .mockResolvedValueOnce(null) // first submit: coord-primary check → no prior primary
      .mockResolvedValueOnce({ id: "existing-nearby-report" }); // second submit: duplicate check → is a dup

    (mockPrisma as unknown as { report: { create: jest.Mock } }).report.create
      .mockResolvedValueOnce({
        id: "first-report-id",
        isDuplicate: false,
        version: 1,
        submittedAt: new Date("2026-01-03T10:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "second-report-id",
        isDuplicate: true,
        version: 1,
        submittedAt: new Date("2026-01-03T10:05:00.000Z"),
      });

    const firstResponse = await service.submit(
      validPayload({
        collectedAt: "2026-01-03T10:00:00.000Z",
        latitude: "36.2021",
        longitude: "36.1601",
      }),
      validPhoto,
    );

    const secondResponse = await service.submit(
      validPayload({
        collectedAt: "2026-01-03T10:05:00.000Z",
        latitude: "36.2021",
        longitude: "36.1601",
      }),
      validPhoto,
    );

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    if (secondResponse.body.success === true) {
      expect(secondResponse.body.data.isDuplicate).toBe(true);
    }
    expect(
      (
        mockPrisma as unknown as {
          report: { create: jest.Mock };
        }
      ).report.create,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          isDuplicate: true,
          version: 1,
        }),
      }),
    );
  });

  it("increments versions 1 -> 2 -> 3 for repeated building submissions", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
      }
    ).report.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "report-v1", version: 1 })
      .mockResolvedValueOnce({ id: "report-v2", version: 2 });

    (mockPrisma as unknown as { report: { create: jest.Mock } }).report.create
      .mockResolvedValueOnce({
        id: "report-v1",
        isDuplicate: false,
        version: 1,
        submittedAt: new Date("2026-01-03T11:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "report-v2",
        isDuplicate: false,
        version: 2,
        submittedAt: new Date("2026-01-03T11:10:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "report-v3",
        isDuplicate: false,
        version: 3,
        submittedAt: new Date("2026-01-03T11:20:00.000Z"),
      });

    await service.submit(
      validPayload({
        buildingId: "building-scale-1",
      }),
      validPhoto,
    );
    await service.submit(
      validPayload({
        buildingId: "building-scale-1",
      }),
      validPhoto,
    );
    await service.submit(
      validPayload({
        buildingId: "building-scale-1",
      }),
      validPhoto,
    );

    expect(
      (
        mockPrisma as unknown as {
          report: { create: jest.Mock };
        }
      ).report.create,
    ).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ version: 1 }),
      }),
    );
    expect(
      (
        mockPrisma as unknown as {
          report: { create: jest.Mock };
        }
      ).report.create,
    ).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ version: 2 }),
      }),
    );
    expect(
      (
        mockPrisma as unknown as {
          report: { create: jest.Mock };
        }
      ).report.create,
    ).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({ version: 3 }),
      }),
    );
  });

  it("sets supersededById chain across older building report versions", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
      }
    ).report.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "chain-v1", version: 1 })
      .mockResolvedValueOnce({ id: "chain-v2", version: 2 });

    (mockPrisma as unknown as { report: { create: jest.Mock } }).report.create
      .mockResolvedValueOnce({
        id: "chain-v1",
        isDuplicate: false,
        version: 1,
        submittedAt: new Date("2026-01-03T12:00:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "chain-v2",
        isDuplicate: false,
        version: 2,
        submittedAt: new Date("2026-01-03T12:10:00.000Z"),
      })
      .mockResolvedValueOnce({
        id: "chain-v3",
        isDuplicate: false,
        version: 3,
        submittedAt: new Date("2026-01-03T12:20:00.000Z"),
      });

    await service.submit(
      validPayload({ buildingId: "building-chain" }),
      validPhoto,
    );
    await service.submit(
      validPayload({ buildingId: "building-chain" }),
      validPhoto,
    );
    await service.submit(
      validPayload({ buildingId: "building-chain" }),
      validPhoto,
    );

    expect(
      (
        mockPrisma as unknown as {
          report: { update: jest.Mock };
        }
      ).report.update,
    ).toHaveBeenNthCalledWith(1, {
      where: { id: "chain-v1" },
      data: { supersededById: "chain-v2" },
    });
    expect(
      (
        mockPrisma as unknown as {
          report: { update: jest.Mock };
        }
      ).report.update,
    ).toHaveBeenNthCalledWith(2, {
      where: { id: "chain-v2" },
      data: { supersededById: "chain-v3" },
    });
  });

  // ── history response shape ────────────────────────────────────────────────

  it("returns full report history chain as flat array", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; findMany: jest.Mock };
      }
    ).report.findFirst.mockResolvedValue({
      id: "history-v3",
      crisisId: "crisis-1",
      buildingId: "building-history-scale",
      latitude: null,
      longitude: null,
      supersededById: null,
    });

    (
      mockPrisma as unknown as {
        report: { findMany: jest.Mock };
      }
    ).report.findMany.mockResolvedValue([
      {
        id: "history-v3",
        version: 3,
        isDuplicate: false,
        submittedAt: new Date("2026-01-03T12:30:00.000Z"),
        damageLevel: "COMPLETE",
        supersededById: null,
      },
      {
        id: "history-v2",
        version: 2,
        isDuplicate: false,
        submittedAt: new Date("2026-01-03T12:20:00.000Z"),
        damageLevel: "PARTIAL",
        supersededById: "history-v3",
      },
      {
        id: "history-v1",
        version: 1,
        isDuplicate: false,
        submittedAt: new Date("2026-01-03T12:10:00.000Z"),
        damageLevel: "MINIMAL",
        supersededById: "history-v2",
      },
    ]);

    const history = await service.getReportHistory("history-v3");

    expect(history.found).toBe(true);
    if (history.found) {
      // data must be a flat array, not { id, history: [...] }
      expect(Array.isArray(history.body.data)).toBe(true);
      expect(history.body.data).toHaveLength(3);
      expect(history.body.data.map((entry) => entry.id)).toEqual([
        "history-v3",
        "history-v2",
        "history-v1",
      ]);
    }
  });

  it("returns report history ordered by newest version first", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; findMany: jest.Mock };
      }
    ).report.findFirst.mockResolvedValue({
      id: "newest-id",
      crisisId: "crisis-1",
      buildingId: "building-h1",
      latitude: null,
      longitude: null,
      supersededById: null,
    });

    (
      mockPrisma as unknown as {
        report: { findMany: jest.Mock };
      }
    ).report.findMany.mockResolvedValue([
      {
        id: "newest-id",
        version: 3,
        isDuplicate: false,
        submittedAt: new Date("2026-01-03T10:00:00.000Z"),
        damageLevel: "COMPLETE",
        supersededById: null,
      },
      {
        id: "older-id",
        version: 2,
        isDuplicate: false,
        submittedAt: new Date("2026-01-02T10:00:00.000Z"),
        damageLevel: "PARTIAL",
        supersededById: "newest-id",
      },
    ]);

    const history = await service.getReportHistory("newest-id");

    expect(history.found).toBe(true);
    if (history.found) {
      expect(Array.isArray(history.body.data)).toBe(true);
      expect(history.body.data).toHaveLength(2);
      expect(history.body.data[0]).toEqual(
        expect.objectContaining({ id: "newest-id", version: 3 }),
      );
      expect(history.body.data[1]).toEqual(
        expect.objectContaining({ id: "older-id", version: 2 }),
      );
    }
  });

  it("sets isCurrent=true only on the most recent version in history (C5)", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; findMany: jest.Mock };
      }
    ).report.findFirst.mockResolvedValue({
      id: "current-v2",
      crisisId: "crisis-1",
      buildingId: "building-current",
      latitude: null,
      longitude: null,
      supersededById: null,
    });

    (
      mockPrisma as unknown as {
        report: { findMany: jest.Mock };
      }
    ).report.findMany.mockResolvedValue([
      {
        id: "current-v2",
        version: 2,
        isDuplicate: false,
        submittedAt: new Date("2026-01-03T11:00:00.000Z"),
        damageLevel: "COMPLETE",
        supersededById: null,
      },
      {
        id: "old-v1",
        version: 1,
        isDuplicate: false,
        submittedAt: new Date("2026-01-02T11:00:00.000Z"),
        damageLevel: "PARTIAL",
        supersededById: "current-v2",
      },
    ]);

    const history = await service.getReportHistory("current-v2");

    expect(history.found).toBe(true);
    if (history.found) {
      expect(history.body.data[0].isCurrent).toBe(true);
      expect(history.body.data[1].isCurrent).toBe(false);
    }
  });

  it("history data items have required ReportVersionSummary fields (C5)", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; findMany: jest.Mock };
      }
    ).report.findFirst.mockResolvedValue({
      id: "rep-id",
      crisisId: "crisis-1",
      buildingId: "building-shape",
      latitude: null,
      longitude: null,
      supersededById: null,
    });

    (
      mockPrisma as unknown as {
        report: { findMany: jest.Mock };
      }
    ).report.findMany.mockResolvedValue([
      {
        id: "rep-id",
        version: 1,
        isDuplicate: false,
        submittedAt: new Date("2026-01-03T10:00:00.000Z"),
        damageLevel: "MINIMAL",
        supersededById: null,
      },
    ]);

    const history = await service.getReportHistory("rep-id");

    expect(history.found).toBe(true);
    if (history.found) {
      const item = history.body.data[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("version");
      expect(item).toHaveProperty("damageLevel");
      expect(item).toHaveProperty("submittedAt");
      expect(item).toHaveProperty("isCurrent");
      // isDuplicate must NOT be in the public summary
      expect(item).not.toHaveProperty("isDuplicate");
    }
  });

  // ── coordinate-based versioning ──────────────────────────────────────────

  it("getReportHistory returns coordinate-based chain when buildingId is absent", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; findMany: jest.Mock };
      }
    ).report.findFirst.mockResolvedValue({
      id: "coord-v2",
      crisisId: "crisis-coord",
      buildingId: null,
      latitude: 38.001,
      longitude: 29.001,
      supersededById: null,
    });

    (
      mockPrisma as unknown as {
        report: { findMany: jest.Mock };
      }
    ).report.findMany.mockResolvedValue([
      {
        id: "coord-v2",
        version: 2,
        damageLevel: "PARTIAL",
        submittedAt: new Date("2026-01-03T12:00:00.000Z"),
        supersededById: null,
      },
      {
        id: "coord-v1",
        version: 1,
        damageLevel: "MINIMAL",
        submittedAt: new Date("2026-01-02T12:00:00.000Z"),
        supersededById: "coord-v2",
      },
    ]);

    const history = await service.getReportHistory("coord-v2");

    expect(history.found).toBe(true);
    if (history.found) {
      expect(Array.isArray(history.body.data)).toBe(true);
      expect(history.body.data).toHaveLength(2);
      expect(history.body.data[0].id).toBe("coord-v2");
      expect(history.body.data[1].id).toBe("coord-v1");
    }

    // Verify findMany was called with coordinate-based where clause
    const findManyCalls = (
      mockPrisma as unknown as { report: { findMany: jest.Mock } }
    ).report.findMany.mock.calls;
    expect(findManyCalls.length).toBeGreaterThan(0);
    const where = findManyCalls[0][0].where;
    expect(where.latitude).toBeDefined();
    expect(where.longitude).toBeDefined();
    expect(where.latitude.gte).toBeCloseTo(38.001 - 0.0005, 4);
    expect(where.latitude.lte).toBeCloseTo(38.001 + 0.0005, 4);
    expect(where.longitude.gte).toBeCloseTo(29.001 - 0.0005, 4);
    expect(where.longitude.lte).toBeCloseTo(29.001 + 0.0005, 4);
    expect(where.crisisId).toBe("crisis-coord");
  });

  it("promotes to version chain when within ±0.0005° and 7-day window", async () => {
    // First findFirst call: duplicate check (tight window) → null
    // Second findFirst call: coord-primary check (wide window) → existing primary
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
      }
    ).report.findFirst
      .mockResolvedValueOnce(null) // duplicate check → not a dup
      .mockResolvedValueOnce({ id: "coord-primary-v1", version: 1 }); // coord-primary found

    (
      mockPrisma as unknown as { report: { create: jest.Mock } }
    ).report.create.mockResolvedValue({
      id: "new-coord-v2",
      isDuplicate: false,
      version: 2,
      submittedAt: new Date(),
    });

    const response = await service.submit(
      validPayload({
        latitude: "36.2024", // within ±0.0005° of existing
        longitude: "36.1604",
        // no buildingId
      }),
      validPhoto,
    );

    expect(response.status).toBe(201);
    if (response.body.success !== true) fail("Expected success");
    // Should NOT be marked as duplicate
    expect(
      (mockPrisma as unknown as { report: { create: jest.Mock } }).report
        .create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isDuplicate: false,
          version: 2,
        }),
      }),
    );
    // Should supersede the previous primary
    expect(
      (mockPrisma as unknown as { report: { update: jest.Mock } }).report
        .update,
    ).toHaveBeenCalledWith({
      where: { id: "coord-primary-v1" },
      data: { supersededById: "new-coord-v2" },
    });
  });

  it("coord-primary query uses ±0.0005° and 7-day window", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock };
      }
    ).report.findFirst
      .mockResolvedValueOnce(null) // duplicate check
      .mockResolvedValueOnce(null); // coord-primary check

    const collectedAt = new Date("2026-01-03T10:00:00.000Z");

    await service.submit(
      validPayload({
        latitude: "36.2021",
        longitude: "36.1601",
        collectedAt: collectedAt.toISOString(),
      }),
      validPhoto,
    );

    const calls = (
      mockPrisma as unknown as { report: { findFirst: jest.Mock } }
    ).report.findFirst.mock.calls;

    // Second call is coord-primary check
    const coordCall = calls[1];
    const where = coordCall[0].where;

    // Spatial tolerance
    expect(where.latitude.gte).toBeCloseTo(36.2021 - 0.0005, 4);
    expect(where.latitude.lte).toBeCloseTo(36.2021 + 0.0005, 4);
    expect(where.longitude.gte).toBeCloseTo(36.1601 - 0.0005, 4);
    expect(where.longitude.lte).toBeCloseTo(36.1601 + 0.0005, 4);

    // 7-day window
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    expect(where.submittedAt.gte.getTime()).toBeCloseTo(
      collectedAt.getTime() - sevenDaysMs,
      -3,
    );

    // Must only look for non-duplicate, non-superseded primaries
    expect(where.isDuplicate).toBe(false);
    expect(where.supersededById).toBe(null);
  });

  it("does not start version chain when within duplicate window (±0.0001°, ±10min)", async () => {
    // Duplicate check returns a hit → isDuplicate=true, coord-primary NOT queried
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; create: jest.Mock };
      }
    ).report.findFirst.mockResolvedValueOnce({ id: "very-recent-nearby" });

    await service.submit(
      validPayload({ latitude: "36.2021", longitude: "36.1601" }),
      validPhoto,
    );

    // create called with isDuplicate: true
    expect(
      (mockPrisma as unknown as { report: { create: jest.Mock } }).report
        .create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDuplicate: true }),
      }),
    );

    // coord-primary was NOT queried (only 1 findFirst call)
    expect(
      (mockPrisma as unknown as { report: { findFirst: jest.Mock } }).report
        .findFirst,
    ).toHaveBeenCalledTimes(1);
  });

  it("does not attempt coord-primary when buildingId is present", async () => {
    (
      mockPrisma as unknown as {
        report: { findFirst: jest.Mock; create: jest.Mock };
      }
    ).report.findFirst.mockResolvedValue(null);

    await service.submit(
      validPayload({
        buildingId: "bldg-has-id",
        latitude: "36.2021",
        longitude: "36.1601",
      }),
      validPhoto,
    );

    // Only 1 findFirst call: the buildingId-based existingPrimary lookup
    expect(
      (mockPrisma as unknown as { report: { findFirst: jest.Mock } }).report
        .findFirst,
    ).toHaveBeenCalledTimes(1);

    const call = (mockPrisma as unknown as { report: { findFirst: jest.Mock } })
      .report.findFirst.mock.calls[0];
    expect(call[0].where.buildingId).toBe("bldg-has-id");
  });

  it("emits realtime update after successful submit", async () => {
    const response = await service.submit(validPayload(), validPhoto);

    expect(response.status).toBe(201);
    expect(
      (
        mockRealtimeFeed as unknown as {
          emitReportUpdate: jest.Mock;
        }
      ).emitReportUpdate,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: "db-report-id",
        crisisId: "crisis-1",
      }),
    );
  });

  // ── PressingNeed enum parity ──────────────────────────────────────────────

  it("accepts CASH_ASSISTANCE as a valid pressing need", async () => {
    const response = await service.submit(
      validPayload({ pressingNeeds: JSON.stringify(["CASH_ASSISTANCE"]) }),
      validPhoto,
    );
    expect(response.status).toBe(201);
  });

  it("accepts HEALTHCARE_MEDICINES as a valid pressing need", async () => {
    const response = await service.submit(
      validPayload({
        pressingNeeds: JSON.stringify(["HEALTHCARE_MEDICINES"]),
      }),
      validPhoto,
    );
    expect(response.status).toBe(201);
  });

  it("accepts LIVELIHOODS_RESTORATION as a valid pressing need", async () => {
    const response = await service.submit(
      validPayload({
        pressingNeeds: JSON.stringify(["LIVELIHOODS_RESTORATION"]),
      }),
      validPhoto,
    );
    expect(response.status).toBe(201);
  });

  it("accepts BASIC_SERVICES as a valid pressing need", async () => {
    const response = await service.submit(
      validPayload({ pressingNeeds: JSON.stringify(["BASIC_SERVICES"]) }),
      validPhoto,
    );
    expect(response.status).toBe(201);
  });

  it("accepts PROTECTION_PSYCHOSOCIAL as a valid pressing need", async () => {
    const response = await service.submit(
      validPayload({
        pressingNeeds: JSON.stringify(["PROTECTION_PSYCHOSOCIAL"]),
      }),
      validPhoto,
    );
    expect(response.status).toBe(201);
  });

  it("accepts LOCAL_AUTHORITY_SUPPORT as a valid pressing need", async () => {
    const response = await service.submit(
      validPayload({
        pressingNeeds: JSON.stringify(["LOCAL_AUTHORITY_SUPPORT"]),
      }),
      validPhoto,
    );
    expect(response.status).toBe(201);
  });

  it("accepts OTHER as a valid pressing need", async () => {
    const response = await service.submit(
      validPayload({ pressingNeeds: JSON.stringify(["OTHER"]) }),
      validPhoto,
    );
    expect(response.status).toBe(201);
  });

  it("rejects CASH_FINANCIAL (old enum value) as a pressing need", async () => {
    const response = await service.submit(
      validPayload({ pressingNeeds: JSON.stringify(["CASH_FINANCIAL"]) }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects SHELTER (old enum value) as a pressing need", async () => {
    const response = await service.submit(
      validPayload({ pressingNeeds: JSON.stringify(["SHELTER"]) }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("rejects INFRASTRUCTURE (old enum value) as a pressing need", async () => {
    const response = await service.submit(
      validPayload({ pressingNeeds: JSON.stringify(["INFRASTRUCTURE"]) }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("accepts and persists pressingNeedsOther free-text", async () => {
    await service.submit(
      validPayload({
        pressingNeeds: JSON.stringify(["OTHER"]),
        pressingNeedsOther: "Emergency generators needed",
      }),
      validPhoto,
    );

    expect(mockPrisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pressingNeedsOther: "Emergency generators needed",
        }),
      }),
    );
  });

  it("persists pressingNeedsOther as null when not provided", async () => {
    await service.submit(validPayload(), validPhoto);

    expect(mockPrisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pressingNeedsOther: undefined,
        }),
      }),
    );
  });

  // ── descriptionLang capture ───────────────────────────────────────────────

  it("persists descriptionLang from payload to the database", async () => {
    await service.submit(validPayload({ descriptionLang: "ar" }), validPhoto);

    expect(mockPrisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          descriptionLang: "ar",
        }),
      }),
    );
  });

  it("defaults descriptionLang to 'en' when not provided", async () => {
    await service.submit(validPayload(), validPhoto);

    expect(mockPrisma.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          descriptionLang: "en",
        }),
      }),
    );
  });

  it("returns 400 when descriptionLang is too short (less than 2 chars)", async () => {
    const response = await service.submit(
      validPayload({ descriptionLang: "x" }),
      validPhoto,
    );
    expect(response.status).toBe(400);
    if (response.body.success === false) {
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
});

describe("ReportsService.getById", () => {
  let service: ReportsService;
  let mockPrisma: PrismaService;

  const fullReport = {
    id: "report-xyz",
    crisisId: "crisis-1",
    damageLevel: "PARTIAL" as const,
    infraType: "RESIDENTIAL" as const,
    infraName: "School Building",
    crisisType: "EARTHQUAKE" as const,
    hasDebris: true,
    collectedAt: new Date("2026-01-10T09:00:00.000Z"),
    description: "Wall cracks observed",
    electricityCondition: "SEVERE_DAMAGE" as const,
    healthServicesFunctioning: "PARTIALLY_FUNCTIONAL" as const,
    pressingNeeds: ["FOOD_WATER", "SHELTER_REPAIR"] as const,
    latitude: 36.2021,
    longitude: 36.1601,
    locationText: "Near school",
    buildingId: null,
    photoKey: "reports/crisis-1/photo.jpg",
    submittedAt: new Date("2026-01-10T09:00:10.000Z"),
    isDuplicate: false,
    version: 1,
    supersededById: null,
    aiDamageLevel: null,
    aiConfidence: null,
    aiAnalyzedAt: null,
    moderationStatus: ModerationStatus.PENDING,
    moderationNote: null,
    moderatedAt: null,
    moderatedBy: null,
    extraFields: {},
  };

  beforeEach(() => {
    mockPrisma = {
      report: {
        findFirst: jest.fn().mockResolvedValue(fullReport),
      },
    } as unknown as PrismaService;

    service = new ReportsService(
      mockPrisma,
      {
        get: jest
          .fn()
          .mockImplementation(
            (key: string, defaultVal?: unknown) => defaultVal,
          ),
      } as unknown as ConfigService,
      {} as unknown as PhotoProcessingService,
      {} as unknown as ReportStorageService,
      {} as unknown as QueueService,
      {} as unknown as RealtimeFeedService,
    );
  });

  it("returns { found: false } when report does not exist", async () => {
    (mockPrisma.report.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await service.getById("nonexistent-id");

    expect(result.found).toBe(false);
  });

  it("returns { found: true } with full report data when report exists", async () => {
    const result = await service.getById("report-xyz");

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.body.success).toBe(true);
      expect(result.body.data.id).toBe("report-xyz");
      expect(result.body.data.crisisId).toBe("crisis-1");
      expect(result.body.data.damageLevel).toBe("PARTIAL");
      expect(result.body.data.electricityCondition).toBe("SEVERE_DAMAGE");
      expect(result.body.data.healthServicesFunctioning).toBe(
        "PARTIALLY_FUNCTIONAL",
      );
      expect(result.body.data.pressingNeeds).toEqual([
        "FOOD_WATER",
        "SHELTER_REPAIR",
      ]);
      expect(result.body.data.description).toBe("Wall cracks observed");
      expect(result.body.data.infraType).toBe("RESIDENTIAL");
      expect(result.body.data.infraName).toBe("School Building");
      expect(result.body.data.photoUrl).toContain("reports/crisis-1/photo.jpg");
      // AI/moderation fields must not be present in the public response
      expect(result.body.data).not.toHaveProperty("moderationStatus");
      expect(result.body.data).not.toHaveProperty("moderationNote");
      expect(result.body.data).not.toHaveProperty("moderatedAt");
      expect(result.body.data).not.toHaveProperty("moderatedBy");
    }
  });

  it("queries Prisma with the provided id", async () => {
    await service.getById("report-xyz");

    expect(mockPrisma.report.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-xyz", deletedAt: null },
      }),
    );
  });

  it("includes translations in the response when present", async () => {
    const reportWithTranslations = {
      ...fullReport,
      extraFields: {
        translations: { en: "Wall cracks", fr: "Fissures murales" },
      },
    };
    (mockPrisma.report.findFirst as jest.Mock).mockResolvedValue(
      reportWithTranslations,
    );

    const result = await service.getById("report-xyz");

    expect(result.found).toBe(true);
    if (result.found) {
      const translations = (
        result.body.data.extraFields as Record<string, unknown>
      ).translations;
      expect(translations).toEqual({
        en: "Wall cracks",
        fr: "Fissures murales",
      });
    }
  });
});

describe("ReportsService.moderate", () => {
  let service: ReportsService;
  let mockPrisma: PrismaService;
  let mockAuditLogCreate: jest.Mock;

  const existingReport = {
    id: "report-mod-1",
    moderationStatus: ModerationStatus.PENDING,
    moderationNote: null,
    moderatedAt: null,
    moderatedBy: null,
  };

  function makeService(findResult: unknown) {
    mockAuditLogCreate = jest.fn().mockResolvedValue({ id: "audit-1" });

    const reportUpdate = jest
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve({ ...existingReport, ...data }),
      );

    mockPrisma = {
      report: {
        findUnique: jest.fn().mockResolvedValue(findResult),
        update: reportUpdate,
      },
      auditLog: {
        create: mockAuditLogCreate,
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === "function") {
          return arg({
            report: { update: reportUpdate },
            auditLog: { create: mockAuditLogCreate },
          });
        }
        return Promise.resolve(arg);
      }),
    } as unknown as PrismaService;

    return new ReportsService(
      mockPrisma,
      {
        get: jest
          .fn()
          .mockImplementation(
            (key: string, defaultVal?: unknown) => defaultVal,
          ),
      } as unknown as ConfigService,
      {} as unknown as PhotoProcessingService,
      {} as unknown as ReportStorageService,
      {} as unknown as QueueService,
      {} as unknown as RealtimeFeedService,
    );
  }

  beforeEach(() => {
    service = makeService(existingReport);
  });

  it("returns { found: false } when report does not exist", async () => {
    service = makeService(null);

    const result = await service.moderate("nonexistent-id", {
      moderationStatus: ModerationStatus.FLAGGED,
      moderatedBy: "admin-user",
    });

    expect(result.found).toBe(false);
  });

  it("updates moderationStatus on the report", async () => {
    const result = await service.moderate("report-mod-1", {
      moderationStatus: ModerationStatus.APPROVED,
      moderatedBy: "admin-user",
    });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.body.success).toBe(true);
      expect(result.body.data.moderationStatus).toBe(ModerationStatus.APPROVED);
    }
  });

  it("persists moderationNote when provided", async () => {
    const result = await service.moderate("report-mod-1", {
      moderationStatus: ModerationStatus.FLAGGED,
      moderationNote: "Suspected duplicate",
      moderatedBy: "admin-user",
    });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.body.data.moderationNote).toBe("Suspected duplicate");
    }
  });

  it("sets moderatedAt and moderatedBy on update", async () => {
    const before = new Date();

    const result = await service.moderate("report-mod-1", {
      moderationStatus: ModerationStatus.UNDER_REVIEW,
      moderatedBy: "admin-user",
    });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(
        new Date(result.body.data.moderatedAt as string).getTime(),
      ).toBeGreaterThanOrEqual(before.getTime());
      expect(result.body.data.moderatedBy).toBe("admin-user");
    }
  });

  it("calls prisma.report.update with the correct where clause", async () => {
    await service.moderate("report-mod-1", {
      moderationStatus: ModerationStatus.REJECTED,
      moderatedBy: "admin-user",
    });

    expect(mockPrisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-mod-1" },
      }),
    );
  });

  it("writes immutable audit log entry after successful moderation", async () => {
    await service.moderate("report-mod-1", {
      moderationStatus: ModerationStatus.FLAGGED,
      moderationNote: "Suspected duplicate",
      moderatedBy: "admin-user",
    });

    expect(mockAuditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "report-mod-1",
          action: "REPORT_MODERATION_UPDATED",
          actorId: "admin-user",
          previousValue: {
            moderationStatus: ModerationStatus.PENDING,
            moderationNote: null,
          },
          newValue: {
            moderationStatus: ModerationStatus.FLAGGED,
            moderationNote: "Suspected duplicate",
          },
        }),
      }),
    );
  });

  it("does not write audit log when report is not found", async () => {
    service = makeService(null);

    await service.moderate("nonexistent-id", {
      moderationStatus: ModerationStatus.APPROVED,
      moderatedBy: "admin-user",
    });

    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("returns paginated audit log entries for an existing report", async () => {
    const reportFindUnique = jest.fn().mockResolvedValue(existingReport);
    const auditFindMany = jest.fn().mockResolvedValue([
      {
        id: "audit-2",
        reportId: "report-mod-1",
        action: "REPORT_MODERATION_UPDATED",
        actorId: "admin-user",
        previousValue: {
          moderationStatus: ModerationStatus.PENDING,
          moderationNote: null,
        },
        newValue: {
          moderationStatus: ModerationStatus.UNDER_REVIEW,
          moderationNote: "Needs triage",
        },
        createdAt: new Date("2026-04-03T09:00:00.000Z"),
      },
    ]);
    const auditCount = jest.fn().mockResolvedValue(3);
    const transactionMock = jest
      .fn()
      .mockImplementation((arg: unknown[]) => Promise.all(arg));

    mockPrisma = {
      report: {
        findUnique: reportFindUnique,
      },
      auditLog: {
        create: jest.fn(),
        findMany: auditFindMany,
        count: auditCount,
      },
      $transaction: transactionMock,
    } as unknown as PrismaService;

    service = new ReportsService(
      mockPrisma,
      {
        get: jest
          .fn()
          .mockImplementation(
            (key: string, defaultVal?: unknown) => defaultVal,
          ),
      } as unknown as ConfigService,
      {} as unknown as PhotoProcessingService,
      {} as unknown as ReportStorageService,
      {} as unknown as QueueService,
      {} as unknown as RealtimeFeedService,
    );

    const result = await service.getModerationAudit("report-mod-1", {
      page: 2,
      pageSize: 1,
    });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.body.success).toBe(true);
      expect(result.body.data.items).toHaveLength(1);
      expect(result.body.data.pagination).toEqual({
        page: 2,
        pageSize: 1,
        totalItems: 3,
        totalPages: 3,
      });
    }

    expect(auditFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reportId: "report-mod-1" },
        skip: 1,
        take: 1,
      }),
    );
  });

  it("returns { found: false } for moderation audit when report does not exist", async () => {
    const reportFindUnique = jest.fn().mockResolvedValue(null);

    mockPrisma = {
      report: {
        findUnique: reportFindUnique,
      },
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    service = new ReportsService(
      mockPrisma,
      {
        get: jest
          .fn()
          .mockImplementation(
            (key: string, defaultVal?: unknown) => defaultVal,
          ),
      } as unknown as ConfigService,
      {} as unknown as PhotoProcessingService,
      {} as unknown as ReportStorageService,
      {} as unknown as QueueService,
      {} as unknown as RealtimeFeedService,
    );

    const result = await service.getModerationAudit("missing-id", {
      page: 1,
      pageSize: 20,
    });

    expect(result.found).toBe(false);
  });
});

describe("ReportsService.privacy", () => {
  let service: ReportsService;
  let mockPrisma: PrismaService;
  let mockStorage: ReportStorageService;

  beforeEach(() => {
    const reportFindUnique = jest.fn().mockResolvedValue({
      id: "report-privacy-1",
      moderationStatus: ModerationStatus.PENDING,
      deletedAt: null,
      photoKey: "reports/report-privacy-1/1.jpg",
    });
    const reportUpdate = jest.fn().mockResolvedValue({
      id: "report-privacy-1",
      deletedAt: new Date("2026-04-03T12:00:00.000Z"),
    });
    const auditLogCreate = jest
      .fn()
      .mockResolvedValue({ id: "audit-privacy-1" });

    mockPrisma = {
      report: {
        findFirst: reportFindUnique,
        update: reportUpdate,
      },
      auditLog: {
        create: auditLogCreate,
      },
      $transaction: jest.fn().mockImplementation((arg: unknown) => {
        if (typeof arg === "function") {
          return arg({
            report: {
              update: reportUpdate,
            },
            auditLog: {
              create: auditLogCreate,
            },
          });
        }
        return Promise.resolve(arg);
      }),
    } as unknown as PrismaService;

    mockStorage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReportStorageService;

    service = new ReportsService(
      mockPrisma,
      {
        get: jest
          .fn()
          .mockImplementation(
            (key: string, defaultVal?: unknown) => defaultVal,
          ),
      } as unknown as ConfigService,
      {} as unknown as PhotoProcessingService,
      mockStorage,
      {} as unknown as QueueService,
      {} as unknown as RealtimeFeedService,
    );
  });

  it("returns { found: false } when soft-deleting a missing report", async () => {
    (mockPrisma.report.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const result = await service.softDelete("missing-report", "admin-user");

    expect(result.found).toBe(false);
    expect(mockStorage.deleteObject).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("soft-deletes a report, deletes its photo object, and writes audit log", async () => {
    const result = await service.softDelete("report-privacy-1", "admin-user");

    expect(result.found).toBe(true);
    expect(mockStorage.deleteObject).toHaveBeenCalledWith(
      "reports/report-privacy-1/1.jpg",
    );
    expect(mockPrisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-privacy-1" },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "report-privacy-1",
          action: "REPORT_DELETED",
          actorId: "admin-user",
          previousValue: {
            moderationStatus: ModerationStatus.PENDING,
            deletedAt: null,
          },
          newValue: expect.objectContaining({
            deletedAt: expect.any(String),
          }),
        }),
      }),
    );
  });

  it("returns { found: false } when anonymizing a missing report", async () => {
    (mockPrisma.report.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const result = await service.anonymize("missing-report", "admin-user");

    expect(result.found).toBe(false);
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("anonymizes PII fields and writes audit log", async () => {
    (mockPrisma.report.update as jest.Mock).mockResolvedValueOnce({
      id: "report-privacy-1",
      anonymizedAt: new Date("2026-04-03T12:10:00.000Z"),
    });

    const result = await service.anonymize("report-privacy-1", "admin-user");

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.body.success).toBe(true);
      expect(result.body.data.id).toBe("report-privacy-1");
      expect(typeof result.body.data.anonymizedAt).toBe("string");
      expect(new Date(result.body.data.anonymizedAt).toString()).not.toBe(
        "Invalid Date",
      );
    }

    expect(mockPrisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-privacy-1" },
        data: {
          deviceHash: null,
          ipHash: null,
          latitude: null,
          longitude: null,
          locationText: null,
          anonymizedAt: expect.any(Date),
        },
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "report-privacy-1",
          action: "REPORT_ANONYMIZED",
          actorId: "admin-user",
        }),
      }),
    );
  });
});

// ── Idempotency key (F6) ────────────────────────────────────────────────────

describe("ReportsService — idempotency key", () => {
  const validPhoto: UploadedPhoto = {
    fieldname: "photo",
    originalname: "photo.jpg",
    encoding: "7bit",
    mimetype: "image/jpeg",
    buffer: Buffer.from([0xff, 0xd8, 0xff]),
  } as unknown as UploadedPhoto;

  function makeService(reportFindUniqueByIdempotency: jest.Mock) {
    const prisma = {
      report: {
        create: jest.fn().mockResolvedValue({
          id: "new-report-id",
          isDuplicate: false,
          version: 1,
          submittedAt: new Date(),
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: reportFindUniqueByIdempotency,
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      crisis: {
        findUnique: jest.fn().mockResolvedValue({
          id: "crisis-1",
          isActive: true,
        }),
      },
    } as unknown as PrismaService;

    const config = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) =>
          key === "STORAGE_PUBLIC_URL"
            ? "http://localhost:9000/reports"
            : defaultValue,
        ),
    } as unknown as ConfigService;

    const photoProcessing = {
      stripExif: jest.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    } as unknown as PhotoProcessingService;

    const storage = {
      uploadReportPhoto: jest.fn().mockResolvedValue({
        photoKey: "reports/crisis-1/photo.jpg",
        thumbnailKey: null,
      }),
    } as unknown as ReportStorageService;

    const queue = {
      enqueueAiClassification: jest.fn().mockResolvedValue({}),
      enqueueTranslation: jest.fn().mockResolvedValue({}),
    } as unknown as QueueService;

    const realtimeFeed = {
      emitReportUpdate: jest.fn(),
    } as unknown as RealtimeFeedService;

    const reporterService = {
      upsertProfile: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReporterService;

    return new ReportsService(
      prisma,
      config,
      photoProcessing,
      storage,
      queue,
      realtimeFeed,
      reporterService,
    );
  }

  const payload = {
    crisisId: "crisis-1",
    damageLevel: "PARTIAL",
    infraType: "RESIDENTIAL",
    infraName: "School",
    crisisType: "EARTHQUAKE",
    hasDebris: "false",
    collectedAt: new Date().toISOString(),
    description: "Idempotency test",
    electricityCondition: "SEVERE_DAMAGE",
    healthServicesFunctioning: "PARTIALLY_FUNCTIONAL",
    pressingNeeds: JSON.stringify(["FOOD_WATER"]),
    extraFields: {},
    latitude: "36.2021",
    longitude: "36.1601",
  };

  it("returns 201 and creates report when idempotency key is new", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = makeService(findUnique);

    const result = await service.submit(payload, validPhoto, "key-new-uuid");

    expect(result.status).toBe(201);
    expect(result.body.success).toBe(true);
  });

  it("stores idempotencyKey on the created report", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = makeService(findUnique);

    await service.submit(payload, validPhoto, "key-store-uuid");

    const prismaAny = (service as unknown as { prisma: PrismaService }).prisma;
    expect(prismaAny.report.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: "key-store-uuid" }),
      }),
    );
  });

  it("returns 200 (not 201) when idempotency key already exists", async () => {
    const existing = {
      id: "existing-report-id",
      isDuplicate: false,
      version: 1,
      photoKey: "reports/crisis-1/existing.jpg",
      submittedAt: new Date(),
    };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(existing) // idempotency check
      .mockResolvedValue({ id: "existing-report-id", crisisId: "crisis-1", buildingId: null });

    const service = makeService(findUnique);

    const result = await service.submit(payload, validPhoto, "key-replay");

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    if (result.body.success) {
      expect(result.body.data.id).toBe("existing-report-id");
    }
  });

  it("does not create a new report when idempotency key is replayed", async () => {
    const existing = {
      id: "existing-report-id",
      isDuplicate: false,
      version: 1,
      photoKey: "reports/crisis-1/existing.jpg",
      submittedAt: new Date(),
    };
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(existing)
      .mockResolvedValue({ id: "existing-report-id", crisisId: "crisis-1", buildingId: null });

    const service = makeService(findUnique);

    await service.submit(payload, validPhoto, "key-replay-no-create");

    const prismaAny = (service as unknown as { prisma: PrismaService }).prisma;
    expect(prismaAny.report.create).not.toHaveBeenCalled();
  });

  it("proceeds normally (201) when no idempotency key is provided", async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const service = makeService(findUnique);

    const result = await service.submit(payload, validPhoto);

    expect(result.status).toBe(201);
  });
});
