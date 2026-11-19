import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { PhotoProcessingService } from "./photo-processing.service";
import { ReportStorageService } from "./report-storage.service";
import { ReportsService, type UploadedPhoto } from "./reports.service";
import { QueueService } from "../queue/queue.service";
import { UN_LANGUAGES } from "../queue/queue.constants";
import { RealtimeFeedService } from "./realtime-feed.service";
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
    pressingNeeds: JSON.stringify(["FOOD_WATER"]),
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

  return {
    report: {
      create: reportCreate,
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
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

describe("ReportsService with Queue", () => {
  let service: ReportsService;
  let mockPrisma: PrismaService;
  let mockConfig: ConfigService;
  let mockPhotoProcessing: PhotoProcessingService;
  let mockStorage: ReportStorageService;
  let mockQueue: QueueService;
  let mockRealtimeFeed: RealtimeFeedService;

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
      enqueueAiClassification: jest.fn().mockResolvedValue({ id: "ai-job" }),
      enqueueTranslation: jest
        .fn()
        .mockResolvedValue({ id: "translation-job" }),
    } as unknown as QueueService;
    mockRealtimeFeed = {
      emitReportUpdate: jest.fn(),
    } as unknown as RealtimeFeedService;

    service = new ReportsService(
      mockPrisma,
      mockConfig,
      mockPhotoProcessing,
      mockStorage,
      mockQueue,
      mockRealtimeFeed,
      { upsertProfile: jest.fn().mockResolvedValue(undefined) } as unknown as ReporterService,
    );
  });

  it("should enqueue AI classification job on successful submit", async () => {
    const response = await service.submit(validPayload(), validPhoto);

    expect(response.status).toBe(201);
    expect(mockQueue.enqueueAiClassification).toHaveBeenCalledTimes(1);
    expect(mockQueue.enqueueAiClassification).toHaveBeenCalledWith(
      expect.any(String), // reportId is generated UUID
      "reports/crisis-1/photo.jpg",
    );
  });

  it("should enqueue translation jobs for all 6 UN languages on successful submit", async () => {
    const response = await service.submit(
      validPayload({ description: "Défaut observé" }),
      validPhoto,
    );

    expect(response.status).toBe(201);
    expect(mockQueue.enqueueTranslation).toHaveBeenCalledTimes(6);

    UN_LANGUAGES.forEach((lang) => {
      expect(mockQueue.enqueueTranslation).toHaveBeenCalledWith(
        expect.any(String), // reportId is generated UUID
        "Défaut observé",
        lang,
      );
    });
  });

  it("should return 201 even if AI job enqueue fails", async () => {
    mockQueue.enqueueAiClassification = jest
      .fn()
      .mockRejectedValue(new Error("Queue unavailable"));

    const response = await service.submit(validPayload(), validPhoto);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("should return 201 even if translation job enqueue fails", async () => {
    mockQueue.enqueueTranslation = jest
      .fn()
      .mockRejectedValue(new Error("Queue unavailable"));

    const response = await service.submit(validPayload(), validPhoto);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("should return 201 even if both job enqueues fail", async () => {
    mockQueue.enqueueAiClassification = jest
      .fn()
      .mockRejectedValue(new Error("Queue unavailable"));
    mockQueue.enqueueTranslation = jest
      .fn()
      .mockRejectedValue(new Error("Queue unavailable"));

    const response = await service.submit(validPayload(), validPhoto);

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    if (response.body.success) {
      expect(response.body.data.id).toBe("db-report-id");
    }
  });
});
