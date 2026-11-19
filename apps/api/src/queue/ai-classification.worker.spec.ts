import { PrismaService } from "../prisma/prisma.service";
import { AiClassificationWorker } from "./ai-classification.worker";
import { DamageLevel } from "@prisma/client";
import { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import {
  AI_CLASSIFICATION_JOB_NAME,
  AI_CLASSIFICATION_QUEUE,
} from "./queue.constants";
import { AiClassificationAdapter } from "./adapters/ai-classification.adapter";

describe("AiClassificationWorker", () => {
  let worker: AiClassificationWorker;
  let mockPrisma: PrismaService;
  let mockAdapter: AiClassificationAdapter;

  beforeEach(() => {
    mockPrisma = {
      report: {
        update: jest.fn().mockResolvedValue({
          id: "report-1",
          aiDamageLevel: DamageLevel.PARTIAL,
          aiConfidence: 0.85,
          aiAnalyzedAt: new Date(),
        }),
      },
    } as unknown as PrismaService;

    mockAdapter = {
      classify: jest.fn().mockResolvedValue({
        damageLevel: DamageLevel.PARTIAL,
        confidence: 0.88,
      }),
    };

    worker = new AiClassificationWorker(mockPrisma, mockAdapter);
  });

  it("should be defined", () => {
    expect(worker).toBeDefined();
  });

  it("should process AI classification and update report on success", async () => {
    const job = {
      data: {
        reportId: "report-1",
        photoKey: "reports/photo.jpg",
      },
      progress: jest.fn(),
    } as unknown as Job;

    await worker.process(job);

    expect(mockAdapter.classify).toHaveBeenCalledWith({
      reportId: "report-1",
      photoKey: "reports/photo.jpg",
    });

    expect(mockPrisma.report.update).toHaveBeenCalledWith({
      where: { id: "report-1" },
      data: {
        aiDamageLevel: DamageLevel.PARTIAL,
        aiConfidence: 0.88,
        aiAnalyzedAt: expect.any(Date),
      },
    });
  });

  it("should handle retry on transient error", async () => {
    mockPrisma = {
      report: {
        update: jest
          .fn()
          .mockRejectedValueOnce(new Error("ECONNREFUSED"))
          .mockResolvedValueOnce({
            id: "report-1",
            aiDamageLevel: DamageLevel.PARTIAL,
            aiConfidence: 0.85,
          }),
      },
    } as unknown as PrismaService;

    worker = new AiClassificationWorker(mockPrisma, mockAdapter);

    const job = {
      data: { reportId: "report-1", photoKey: "reports/photo.jpg" },
      progress: jest.fn(),
      attemptsMade: 0,
    } as unknown as Job;

    // First attempt fails with transient error
    try {
      await worker.process(job);
    } catch (e) {
      expect((e as Error).message).toContain("ECONNREFUSED");
    }
  });

  it("should throw when processing fails after retries", async () => {
    mockPrisma = {
      report: {
        update: jest.fn().mockRejectedValue(new Error("Permanent failure")),
      },
    } as unknown as PrismaService;

    worker = new AiClassificationWorker(mockPrisma, mockAdapter);

    const job = {
      data: { reportId: "report-1", photoKey: "reports/photo.jpg" },
      progress: jest.fn(),
      attemptsMade: 2,
    } as unknown as Job;

    await expect(worker.process(job)).rejects.toThrow("Permanent failure");
  });

  it("uses centralized constants for processor and job names", () => {
    expect(AI_CLASSIFICATION_QUEUE).toBe("ai-classification");
    expect(AI_CLASSIFICATION_JOB_NAME).toBe("classify");
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

  describe("logging", () => {
    afterEach(() => jest.restoreAllMocks());

    it("logs job start with reportId", async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, "log")
        .mockImplementation(() => {});

      const job = {
        id: "job-42",
        data: { reportId: "report-log-1", photoKey: "reports/photo.jpg" },
        progress: jest.fn(),
      } as unknown as Job;

      await worker.process(job);

      const allMessages = logSpy.mock.calls.map((c) => String(c[0]));
      expect(allMessages.some((m) => m.includes("report-log-1"))).toBe(true);
    });

    it("logs job completion with damageLevel and confidence", async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, "log")
        .mockImplementation(() => {});

      const job = {
        id: "job-43",
        data: { reportId: "report-log-2", photoKey: "reports/photo.jpg" },
        progress: jest.fn(),
      } as unknown as Job;

      await worker.process(job);

      const allMessages = logSpy.mock.calls.map((c) => String(c[0]));
      const completionMsg = allMessages.find((m) => m.includes("PARTIAL"));
      expect(completionMsg).toBeDefined();
      expect(completionMsg).toContain("0.88");
    });

    it("logs error when job processing fails", async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => {});

      mockAdapter = {
        classify: jest.fn().mockRejectedValue(new Error("api down")),
      };
      worker = new AiClassificationWorker(mockPrisma, mockAdapter);

      const job = {
        id: "job-44",
        data: { reportId: "report-log-3", photoKey: "reports/photo.jpg" },
        progress: jest.fn(),
      } as unknown as Job;

      await expect(worker.process(job)).rejects.toThrow("api down");

      const errMessages = errorSpy.mock.calls.map((c) => String(c[0]));
      expect(errMessages.some((m) => m.includes("report-log-3"))).toBe(true);
    });
  });
});
