import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ReportStorageService } from "../reports/report-storage.service";
import { RetentionWorker } from "./retention.worker";

describe("RetentionWorker", () => {
  let worker: RetentionWorker;
  let mockPrisma: PrismaService;
  let mockConfig: ConfigService;
  let mockStorage: ReportStorageService;

  beforeEach(() => {
    mockPrisma = {
      report: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: "old-report-1" }, { id: "old-report-2" }]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: "old-report-1",
            moderationStatus: "PENDING",
            deletedAt: null,
            photoKey: "reports/old-report-1/1.jpg",
          })
          .mockResolvedValueOnce({
            id: "old-report-2",
            moderationStatus: "PENDING",
            deletedAt: null,
            photoKey: null,
          }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: any) => Promise<any>) =>
          fn({
            report: {
              update: mockPrisma.report.update,
            },
            auditLog: {
              create: mockPrisma.auditLog.create,
            },
          }),
        ),
    } as unknown as PrismaService;

    mockConfig = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: number) => {
          if (key === "RETENTION_DAYS") {
            return 730;
          }
          return defaultValue;
        }),
    } as unknown as ConfigService;

    mockStorage = {
      deleteObject: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReportStorageService;

    worker = new RetentionWorker(mockPrisma, mockConfig, mockStorage);
  });

  it("soft-deletes reports older than RETENTION_DAYS and logs purge count", async () => {
    const loggerLogSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation();

    const result = await worker.process({
      id: "retention-job-1",
      data: {},
    } as unknown as Job<Record<string, never>>);

    expect(mockPrisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          collectedAt: {
            lt: expect.any(Date),
          },
        }),
        select: { id: true },
      }),
    );

    expect(mockStorage.deleteObject).toHaveBeenCalledWith(
      "reports/old-report-1/1.jpg",
    );
    expect(mockPrisma.report.update).toHaveBeenCalledTimes(2);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reportId: "old-report-1",
          actorId: "system:retention",
          action: AuditAction.REPORT_DELETED,
        }),
      }),
    );

    expect(result).toEqual({ purged: 2 });
    expect(loggerLogSpy).toHaveBeenCalledWith(
      "Retention purge completed. Purged 2 report(s).",
    );

    loggerLogSpy.mockRestore();
  });

  it("uses default RETENTION_DAYS=730 when config is missing", async () => {
    (mockConfig.get as jest.Mock).mockImplementation(
      (_key: string, defaultValue?: number) => defaultValue,
    );

    await worker.process({
      id: "retention-job-2",
      data: {},
    } as unknown as Job<Record<string, never>>);

    expect(mockPrisma.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          collectedAt: {
            lt: expect.any(Date),
          },
        }),
      }),
    );
  });
});
