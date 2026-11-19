import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, OnApplicationShutdown } from "@nestjs/common";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { AI_CLASSIFICATION_QUEUE } from "./queue.constants";
import {
  AiClassificationAdapter,
  injectAiClassificationAdapter,
} from "./adapters/ai-classification.adapter";

@Processor(AI_CLASSIFICATION_QUEUE)
export class AiClassificationWorker
  extends WorkerHost
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(AiClassificationWorker.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @injectAiClassificationAdapter()
    private readonly aiClassificationAdapter: AiClassificationAdapter,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { reportId, photoKey } = job.data as {
      reportId: string;
      photoKey: string;
    };

    this.logger.log(
      `Starting AI classification for job ${job.id ?? "unknown"}, report ${reportId}`,
    );

    let result: Awaited<
      ReturnType<typeof this.aiClassificationAdapter.classify>
    >;
    try {
      result = await this.aiClassificationAdapter.classify({
        reportId,
        photoKey,
      });
    } catch (error) {
      this.logger.error(
        `AI classification failed for report ${reportId}: ${error instanceof Error ? error.message : "unknown"}`,
      );
      throw error;
    }

    this.logger.log(
      `AI classification complete for report ${reportId}: ${result.damageLevel} (confidence=${result.confidence})`,
    );

    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        aiDamageLevel: result.damageLevel,
        aiConfidence: result.confidence,
        aiAnalyzedAt: new Date(),
      },
    });
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.worker.close();
    } catch {
      // Worker may not be initialized in isolated unit/e2e contexts.
    }
  }
}
