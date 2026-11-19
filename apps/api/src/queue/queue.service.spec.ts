import { Test, TestingModule } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { QueueService } from "./queue.service";
import {
  AI_CLASSIFICATION_JOB_NAME,
  AI_CLASSIFICATION_QUEUE,
  DESCRIPTION_TRANSLATION_JOB_NAME,
  DESCRIPTION_TRANSLATION_QUEUE,
  EXPORT_JOB_NAME,
  EXPORT_JOB_OPTIONS,
  EXPORT_QUEUE,
  RETENTION_JOB_NAME,
  RETENTION_JOB_OPTIONS,
  RETENTION_QUEUE,
  QUEUE_JOB_OPTIONS,
} from "./queue.constants";

describe("QueueService", () => {
  let service: QueueService;
  let mockAiQueue: Queue;
  let mockTranslationQueue: Queue;
  let mockExportQueue: Queue;
  let mockRetentionQueue: Queue;

  beforeEach(async () => {
    mockAiQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-1" }),
    } as unknown as Queue;

    mockTranslationQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-2" }),
    } as unknown as Queue;

    mockExportQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-3" }),
      getJob: jest.fn().mockResolvedValue(null),
    } as unknown as Queue;

    mockRetentionQueue = {
      add: jest.fn().mockResolvedValue({ id: "retention-job-1" }),
    } as unknown as Queue;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        {
          provide: getQueueToken(AI_CLASSIFICATION_QUEUE),
          useValue: mockAiQueue,
        },
        {
          provide: getQueueToken(DESCRIPTION_TRANSLATION_QUEUE),
          useValue: mockTranslationQueue,
        },
        {
          provide: getQueueToken(EXPORT_QUEUE),
          useValue: mockExportQueue,
        },
        {
          provide: getQueueToken(RETENTION_QUEUE),
          useValue: mockRetentionQueue,
        },
      ],
    }).compile();

    service = module.get<QueueService>(QueueService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("should schedule daily retention job on module init", async () => {
    await service.onModuleInit();

    expect(mockRetentionQueue.add).toHaveBeenCalledWith(
      RETENTION_JOB_NAME,
      {},
      RETENTION_JOB_OPTIONS,
    );
  });

  it("should enqueue AI classification job with correct options", async () => {
    await service.enqueueAiClassification("report-1", "photo.jpg");

    expect(mockAiQueue.add).toHaveBeenCalledWith(
      AI_CLASSIFICATION_JOB_NAME,
      {
        reportId: "report-1",
        photoKey: "photo.jpg",
      },
      QUEUE_JOB_OPTIONS,
    );
  });

  it("should enqueue translation job with correct options", async () => {
    await service.enqueueTranslation("report-1", "Observed damage", "ar");

    expect(mockTranslationQueue.add).toHaveBeenCalledWith(
      DESCRIPTION_TRANSLATION_JOB_NAME,
      {
        reportId: "report-1",
        description: "Observed damage",
        targetLanguage: "ar",
      },
      QUEUE_JOB_OPTIONS,
    );
  });

  it("should throw if enqueueing fails", async () => {
    mockAiQueue.add = jest
      .fn()
      .mockRejectedValue(new Error("Queue unavailable"));

    await expect(
      service.enqueueAiClassification("report-1", "photo.jpg"),
    ).rejects.toThrow("Queue unavailable");
  });

  it("should enqueue reports export job", async () => {
    await service.enqueueReportsExport({
      crisisId: "crisis-1",
      format: "csv",
    });

    expect(mockExportQueue.add).toHaveBeenCalledWith(
      EXPORT_JOB_NAME,
      {
        crisisId: "crisis-1",
        format: "csv",
      },
      EXPORT_JOB_OPTIONS,
    );
  });

  it("should fetch export job by id", async () => {
    const job = { id: "export-1" };
    (mockExportQueue.getJob as jest.Mock).mockResolvedValueOnce(job);

    await expect(service.getReportsExportJob("export-1")).resolves.toEqual(job);
    expect(mockExportQueue.getJob).toHaveBeenCalledWith("export-1");
  });
});
