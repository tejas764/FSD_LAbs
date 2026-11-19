import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { softDeleteReport } from "../reports/report-privacy.service";
import { ReportStorageService } from "../reports/report-storage.service";
import { RETENTION_QUEUE } from "./queue.constants";

@Processor(RETENTION_QUEUE)
export class RetentionWorker
  extends WorkerHost
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(RetentionWorker.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(ReportStorageService)
    private readonly reportStorageService: ReportStorageService,
  ) {
    super();
  }

  async process(_job: Job<Record<string, never>>): Promise<{ purged: number }> {
    const retentionDays = this.configService.get<number>("RETENTION_DAYS", 730);
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);

    const candidates = await this.prisma.report.findMany({
      where: {
        deletedAt: null,
        collectedAt: {
          lt: cutoff,
        },
      },
      select: {
        id: true,
      },
    });

    let purged = 0;
    for (const candidate of candidates) {
      const result = await softDeleteReport({
        prisma: this.prisma,
        reportStorageService: this.reportStorageService,
        reportId: candidate.id,
        actorId: "system:retention",
      });

      if (result.found) {
        purged += 1;
      }
    }

    this.logger.log(`Retention purge completed. Purged ${purged} report(s).`);

    return { purged };
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.worker.close();
    } catch {
      // Worker may be undefined in isolated tests.
    }
  }
}
