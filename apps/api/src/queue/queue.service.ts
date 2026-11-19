import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { getQueueToken } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  AI_CLASSIFICATION_JOB_NAME,
  AI_CLASSIFICATION_QUEUE,
  DESCRIPTION_TRANSLATION_JOB_NAME,
  DESCRIPTION_TRANSLATION_QUEUE,
  EXPORT_JOB_NAME,
  EXPORT_QUEUE,
  EXPORT_JOB_OPTIONS,
  RETENTION_JOB_NAME,
  RETENTION_JOB_OPTIONS,
  RETENTION_QUEUE,
  QUEUE_JOB_OPTIONS,
} from "./queue.constants";

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(getQueueToken(AI_CLASSIFICATION_QUEUE))
    private readonly aiClassificationQueue: Queue,
    @Inject(getQueueToken(DESCRIPTION_TRANSLATION_QUEUE))
    private readonly descriptionTranslationQueue: Queue,
    @Inject(getQueueToken(EXPORT_QUEUE))
    private readonly reportsExportQueue: Queue,
    @Inject(getQueueToken(RETENTION_QUEUE))
    private readonly retentionQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.retentionQueue.add(
      RETENTION_JOB_NAME,
      {},
      RETENTION_JOB_OPTIONS,
    );
  }

  async enqueueAiClassification(
    reportId: string,
    photoKey: string,
  ): Promise<any> {
    return this.aiClassificationQueue.add(
      AI_CLASSIFICATION_JOB_NAME,
      {
        reportId,
        photoKey,
      },
      QUEUE_JOB_OPTIONS,
    );
  }

  async enqueueTranslation(
    reportId: string,
    description: string,
    targetLanguage: string,
  ): Promise<any> {
    return this.descriptionTranslationQueue.add(
      DESCRIPTION_TRANSLATION_JOB_NAME,
      {
        reportId,
        description,
        targetLanguage,
      },
      QUEUE_JOB_OPTIONS,
    );
  }

  async enqueueReportsExport(payload: {
    crisisId?: string;
    format: "csv" | "geojson" | "shapefile";
    dateFrom?: string;
    dateTo?: string;
    bounds?: string;
  }): Promise<any> {
    return this.reportsExportQueue.add(
      EXPORT_JOB_NAME,
      payload,
      EXPORT_JOB_OPTIONS,
    );
  }

  async getReportsExportJob(jobId: string): Promise<any> {
    return this.reportsExportQueue.getJob(jobId);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.aiClassificationQueue.close(),
      this.descriptionTranslationQueue.close(),
      this.reportsExportQueue.close(),
      this.retentionQueue.close(),
    ]);
  }
}
