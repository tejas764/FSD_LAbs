import { PrismaService } from "../prisma/prisma.service";
import { DescriptionTranslationWorker } from "./description-translation.worker";
import { Job } from "bullmq";
import { DescriptionTranslationAdapter } from "./adapters/description-translation.adapter";
import {
  DESCRIPTION_TRANSLATION_JOB_NAME,
  DESCRIPTION_TRANSLATION_QUEUE,
} from "./queue.constants";

describe("DescriptionTranslationWorker", () => {
  let worker: DescriptionTranslationWorker;
  let mockPrisma: PrismaService;
  let mockAdapter: DescriptionTranslationAdapter;

  beforeEach(() => {
    mockPrisma = {
      report: {
        findUnique: jest.fn().mockResolvedValue({
          id: "report-1",
          extraFields: {},
          descriptionLang: "en",
        }),
        update: jest.fn().mockResolvedValue({
          id: "report-1",
          description: "Observed heavy damage",
          descriptionLang: "en",
        }),
      },
    } as unknown as PrismaService;

    mockAdapter = {
      translate: jest.fn().mockResolvedValue("AR::Observed heavy damage"),
    };

    worker = new DescriptionTranslationWorker(mockPrisma, mockAdapter);
  });

  it("should be defined", () => {
    expect(worker).toBeDefined();
  });

  it("should process translation and update report on success", async () => {
    const job = {
      data: {
        reportId: "report-1",
        description: "Observed heavy damage",
        targetLanguage: "ar",
      },
      progress: jest.fn(),
    } as unknown as Job;

    await worker.process(job);

    expect(mockAdapter.translate).toHaveBeenCalledWith({
      text: "Observed heavy damage",
      sourceLanguage: "en",
      targetLanguage: "ar",
    });

    expect(mockPrisma.report.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "report-1" },
        data: expect.objectContaining({
          extraFields: expect.objectContaining({
            translations: expect.objectContaining({
              ar: "AR::Observed heavy damage",
            }),
          }),
        }),
      }),
    );

    const firstCall = (mockPrisma.report.update as jest.Mock).mock
      .calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(firstCall.data.descriptionLang).toBeUndefined();
  });

  it("should handle retry on transient error", async () => {
    mockPrisma = {
      report: {
        findUnique: jest.fn().mockResolvedValue({
          id: "report-1",
          extraFields: {},
          descriptionLang: "en",
        }),
        update: jest
          .fn()
          .mockRejectedValueOnce(new Error("ECONNREFUSED"))
          .mockResolvedValueOnce({
            id: "report-1",
          }),
      },
    } as unknown as PrismaService;

    worker = new DescriptionTranslationWorker(mockPrisma, mockAdapter);

    const job = {
      data: {
        reportId: "report-1",
        description: "Observed heavy damage",
        targetLanguage: "fr",
      },
      progress: jest.fn(),
      attemptsMade: 0,
    } as unknown as Job;

    try {
      await worker.process(job);
    } catch (e) {
      expect((e as Error).message).toContain("ECONNREFUSED");
    }
  });

  it("should throw when processing fails after retries", async () => {
    mockPrisma = {
      report: {
        findUnique: jest.fn().mockResolvedValue({
          id: "report-1",
          extraFields: {},
          descriptionLang: "en",
        }),
        update: jest.fn().mockRejectedValue(new Error("Permanent failure")),
      },
    } as unknown as PrismaService;

    worker = new DescriptionTranslationWorker(mockPrisma, mockAdapter);

    const job = {
      data: {
        reportId: "report-1",
        description: "Observed heavy damage",
        targetLanguage: "zh",
      },
      progress: jest.fn(),
      attemptsMade: 2,
    } as unknown as Job;

    await expect(worker.process(job)).rejects.toThrow("Permanent failure");
  });

  it("uses centralized constants for processor and job names", () => {
    expect(DESCRIPTION_TRANSLATION_QUEUE).toBe("description-translation");
    expect(DESCRIPTION_TRANSLATION_JOB_NAME).toBe("translate");
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
});
