import { Module } from "@nestjs/common";
import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import type { ConnectionOptions, Queue } from "bullmq";
import { QueueService } from "./queue.service";
import { AiClassificationWorker } from "./ai-classification.worker";
import { DescriptionTranslationWorker } from "./description-translation.worker";
import { ReportsExportWorker } from "./reports-export.worker";
import { RetentionWorker } from "./retention.worker";
import { PrismaModule } from "../prisma/prisma.module";
import {
  AI_CLASSIFICATION_QUEUE,
  DESCRIPTION_TRANSLATION_QUEUE,
  EXPORT_QUEUE,
  RETENTION_QUEUE,
} from "./queue.constants";
import {
  AI_CLASSIFICATION_ADAPTER_TOKEN,
  buildAiClassificationAdapter,
} from "./adapters/ai-classification.adapter";
import {
  DESCRIPTION_TRANSLATION_ADAPTER_TOKEN,
  buildDescriptionTranslationAdapter,
} from "./adapters/description-translation.adapter";
import { ReportStorageService } from "../reports/report-storage.service";

type InMemoryJob = {
  id: string;
  failedReason: string | null;
  returnvalue: unknown;
  getState: () => Promise<"waiting">;
};

class InMemoryQueue {
  private readonly jobs = new Map<string, InMemoryJob>();
  private sequence = 0;

  async add(): Promise<InMemoryJob> {
    const id = `job-${++this.sequence}`;
    const job: InMemoryJob = {
      id,
      failedReason: null,
      returnvalue: null,
      getState: async () => "waiting",
    };
    this.jobs.set(id, job);
    return job;
  }

  async getJob(jobId: string): Promise<InMemoryJob | null> {
    return this.jobs.get(jobId) ?? null;
  }

  async close(): Promise<void> {
    // No resources to release in test mode.
  }

  async drain(): Promise<void> {
    this.jobs.clear();
  }
}

const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.env.JEST_WORKER_ID !== undefined;

const queueWorkerProviders = process.env.JEST_WORKER_ID
  ? []
  : [
      AiClassificationWorker,
      DescriptionTranslationWorker,
      ReportsExportWorker,
      RetentionWorker,
    ];

const queueImports = isTestEnv
  ? [PrismaModule]
  : [
      BullModule.forRootAsync({
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => {
          const password = configService.get<string>("REDIS_PASSWORD");
          const db = configService.get<number>("REDIS_DB", 0);
          const connection: ConnectionOptions = {
            host: configService.get<string>("REDIS_HOST", "localhost"),
            port: configService.get<number>("REDIS_PORT", 6379),
            db,
          };
          if (password) {
            connection.password = password;
          }
          return { connection };
        },
      }),
      BullModule.registerQueue(
        { name: AI_CLASSIFICATION_QUEUE },
        { name: DESCRIPTION_TRANSLATION_QUEUE },
        { name: EXPORT_QUEUE },
        { name: RETENTION_QUEUE },
      ),
      PrismaModule,
    ];

const testQueueProviders = isTestEnv
  ? [
      {
        provide: getQueueToken(AI_CLASSIFICATION_QUEUE),
        useFactory: () => new InMemoryQueue() as unknown as Queue,
      },
      {
        provide: getQueueToken(DESCRIPTION_TRANSLATION_QUEUE),
        useFactory: () => new InMemoryQueue() as unknown as Queue,
      },
      {
        provide: getQueueToken(EXPORT_QUEUE),
        useFactory: () => new InMemoryQueue() as unknown as Queue,
      },
      {
        provide: getQueueToken(RETENTION_QUEUE),
        useFactory: () => new InMemoryQueue() as unknown as Queue,
      },
    ]
  : [];

@Module({
  imports: queueImports,
  providers: [
    {
      provide: AI_CLASSIFICATION_ADAPTER_TOKEN,
      inject: [ConfigService],
      useFactory: buildAiClassificationAdapter,
    },
    {
      provide: DESCRIPTION_TRANSLATION_ADAPTER_TOKEN,
      inject: [ConfigService],
      useFactory: buildDescriptionTranslationAdapter,
    },
    QueueService,
    ReportStorageService,
    ...testQueueProviders,
    ...queueWorkerProviders,
  ],
  exports: [QueueService],
})
export class QueueModule {}
