import type { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { ReportStorageService } from "../reports/report-storage.service";
import { RealtimeFeedService } from "../reports/realtime-feed.service";
import { ReportsExportWorker } from "./reports-export.worker";

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

function createRow(id: string, crisisId: string) {
  return {
    id,
    crisisId,
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
    submittedAt: new Date("2026-04-04T00:00:00.000Z"),
    deletedAt: null,
    createdAt: new Date("2026-04-04T00:00:00.000Z"),
    updatedAt: new Date("2026-04-04T00:00:00.000Z"),
  };
}

describe("ReportsExportWorker scale validation", () => {
  let worker: ReportsExportWorker;
  let mockPrisma: PrismaService;
  let mockStorage: ReportStorageService;
  let mockRealtimeFeed: RealtimeFeedService;

  beforeEach(() => {
    mockPrisma = {
      report: {
        findMany: jest.fn(),
      },
    } as unknown as PrismaService;

    mockStorage = {
      uploadExportFile: jest.fn().mockImplementation(async ({ content }) => {
        await drainUploadContent(content);
      }),
      createSignedDownloadUrl: jest
        .fn()
        .mockResolvedValue("https://example.com/exports/scale.csv?sig=abc"),
    } as unknown as ReportStorageService;

    mockRealtimeFeed = {
      emitExportComplete: jest.fn(),
    } as unknown as RealtimeFeedService;

    worker = new ReportsExportWorker(mockPrisma, mockStorage, mockRealtimeFeed);
  });

  it.each([
    {
      totalRows: 50000,
      expectedCalls: 101,
      crisisId: "crisis-local",
      jobId: "50000",
    },
    {
      totalRows: 250000,
      expectedCalls: 501,
      crisisId: "crisis-regional",
      jobId: "250000",
    },
    {
      totalRows: 500000,
      expectedCalls: 1001,
      crisisId: "crisis-national",
      jobId: "500000",
    },
  ])(
    "streams a $totalRows-row csv export in 500-row chunks",
    async ({ totalRows, expectedCalls, crisisId, jobId }) => {
      const chunkSize = 500;
      const reusableRow = createRow("export-0", crisisId);

      (mockPrisma.report.findMany as jest.Mock).mockImplementation(({ cursor }) => {
        const start = cursor
          ? Number(String((cursor as { id: string }).id).replace("export-", "")) + 1
          : 0;

        if (start >= totalRows) {
          return Promise.resolve([]);
        }

        const size = Math.min(chunkSize, totalRows - start);
        const chunk = Array.from({ length: size }, () => reusableRow);
        chunk[chunk.length - 1] = {
          ...reusableRow,
          id: `export-${start + size - 1}`,
        };

        return Promise.resolve(chunk);
      });

      await worker.process({
        id: jobId,
        data: { crisisId, format: "csv" },
      } as unknown as Job<ReportsExportJobData>);

      expect(mockPrisma.report.findMany).toHaveBeenCalledTimes(expectedCalls);
      const uploadArg = (mockStorage.uploadExportFile as jest.Mock).mock.calls[0][0] as {
        content: unknown;
      };
      expect(Buffer.isBuffer(uploadArg.content)).toBe(false);
    },
  );
});