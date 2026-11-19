import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, OnApplicationShutdown } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Job } from "bullmq";
import { PrismaService } from "../prisma/prisma.service";
import { DESCRIPTION_TRANSLATION_QUEUE } from "./queue.constants";
import {
  DescriptionTranslationAdapter,
  injectDescriptionTranslationAdapter,
} from "./adapters/description-translation.adapter";

@Processor(DESCRIPTION_TRANSLATION_QUEUE)
export class DescriptionTranslationWorker
  extends WorkerHost
  implements OnApplicationShutdown
{
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @injectDescriptionTranslationAdapter()
    private readonly translationAdapter: DescriptionTranslationAdapter,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const { reportId, description, targetLanguage } = job.data as {
      reportId: string;
      description: string;
      targetLanguage: string;
    };

    const existingReport = await this.prisma.report.findUnique({
      where: { id: reportId },
      select: { extraFields: true, descriptionLang: true },
    });

    const sourceLanguage = existingReport?.descriptionLang ?? "en";
    const translatedDescription = await this.translationAdapter.translate({
      text: description,
      sourceLanguage,
      targetLanguage,
    });

    const existingExtraFields =
      existingReport &&
      existingReport.extraFields &&
      typeof existingReport.extraFields === "object" &&
      !Array.isArray(existingReport.extraFields)
        ? (existingReport.extraFields as Record<string, unknown>)
        : {};

    const existingTranslations =
      existingExtraFields.translations &&
      typeof existingExtraFields.translations === "object" &&
      !Array.isArray(existingExtraFields.translations)
        ? (existingExtraFields.translations as Record<string, string>)
        : {};

    const nextExtraFields: Prisma.InputJsonObject = {
      ...existingExtraFields,
      translations: {
        ...existingTranslations,
        [targetLanguage]: translatedDescription,
      },
    };

    await this.prisma.report.update({
      where: { id: reportId },
      data: {
        extraFields: nextExtraFields,
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
