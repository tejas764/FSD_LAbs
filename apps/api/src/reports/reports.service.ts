import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AuditAction,
  DamageLevel,
  InfraType,
  CrisisType,
  ElectricityCondition,
  HealthServicesFunctioning,
  ModerationStatus,
  PressingNeed,
  Prisma,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { z } from "zod";
import { ErrorCode } from "../common/error-codes";
import { PrismaService } from "../prisma/prisma.service";
import { PhotoProcessingService } from "./photo-processing.service";
import { ReportStorageService } from "./report-storage.service";
import { QueueService } from "../queue/queue.service";
import { UN_LANGUAGES } from "../queue/queue.constants";
import { RealtimeFeedService } from "./realtime-feed.service";
import { anonymizeReport, softDeleteReport } from "./report-privacy.service";
import { ReporterService } from "../reporter/reporter.service";

const submitSchema = z
  .object({
    crisisId: z.string().min(1),
    buildingId: z.string().trim().optional(),
    damageLevel: z.nativeEnum(DamageLevel),
    infraType: z.nativeEnum(InfraType),
    infraName: z.string().min(1),
    crisisType: z.nativeEnum(CrisisType),
    hasDebris: z.enum(["true", "false"]),
    collectedAt: z.string().datetime(),
    description: z.string().trim().min(1).optional(),
    // UNDP Appendix 1 mandatory questions
    electricityCondition: z.nativeEnum(ElectricityCondition),
    healthServicesFunctioning: z.nativeEnum(HealthServicesFunctioning),
    pressingNeeds: z.preprocess(
      (v) => (typeof v === "string" ? safeJsonParse(v) : v),
      z.array(z.nativeEnum(PressingNeed)).min(1),
    ),
    pressingNeedsOther: z.string().max(500).optional(),
    descriptionLang: z.string().min(2).max(10).optional().default("en"),
    extraFields: z.record(z.string(), z.unknown()).optional().default({}),
    latitude: z.string().optional(),
    longitude: z.string().optional(),
    locationText: z.string().trim().optional(),
    reporterId: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasCoordinates = Boolean(value.latitude && value.longitude);
    const hasLocationText = Boolean(value.locationText);

    if (!hasCoordinates && !hasLocationText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "location must include latitude+longitude or locationText",
        path: ["location"],
      });
    }
  });

export type ErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type SubmitSuccess = {
  success: true;
  data: {
    id: string;
    photoUrl: string;
    acknowledgment: string;
    isDuplicate: boolean;
    version: number;
  };
};

export type UploadedPhoto = {
  buffer: Buffer;
  mimetype: string;
};

type ReportsQueryInput = {
  crisisId?: string;
  bounds?: string;
  damageLevel?: DamageLevel;
  moderationStatus?: ModerationStatus;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
};

type ReportVersionSummary = {
  id: string;
  version: number;
  damageLevel: DamageLevel;
  submittedAt: string;
  isCurrent: boolean;
};

type ExportJobInput = {
  crisisId?: string;
  format: "csv" | "geojson" | "shapefile";
  dateFrom?: string;
  dateTo?: string;
  bounds?: string;
};

@Injectable()
export class ReportsService {
  private readonly storagePublicUrl: string;
  private readonly logger = new Logger(ReportsService.name);
  /** Max GeoJSON features per map request. GeoJSON points are ~200 bytes each;
   *  1 000 records ≈ 200 KB — well within budget for the analyst dashboard. */
  private readonly maxPageSize = 1000;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) configService: ConfigService,
    @Inject(PhotoProcessingService)
    private readonly photoProcessingService: PhotoProcessingService,
    @Inject(ReportStorageService)
    private readonly reportStorageService: ReportStorageService,
    @Inject(QueueService) private readonly queueService: QueueService,
    @Inject(RealtimeFeedService)
    private readonly realtimeFeedService: RealtimeFeedService,
    @Optional()
    @Inject(ReporterService)
    private readonly reporterService?: ReporterService,
  ) {
    this.storagePublicUrl = configService.get<string>(
      "STORAGE_PUBLIC_URL",
      "http://localhost:9000/crisismap-reports",
    );
  }

  async submit(
    payload: Record<string, unknown>,
    photo?: UploadedPhoto,
    idempotencyKey?: string,
    ipHash?: string,
    deviceHash?: string,
  ): Promise<{
    status: number;
    body: ErrorEnvelope | SubmitSuccess;
  }> {
    if (!photo) {
      return this.validationError("photo is required", ["photo"]);
    }

    if (!photo.mimetype.startsWith("image/")) {
      return this.validationError("photo must be an image", ["photo"]);
    }

    // Idempotency check: replay returns original report with status 200
    if (idempotencyKey) {
      const existing = await this.prisma.report.findUnique({
        where: { idempotencyKey },
        select: { id: true, isDuplicate: true, version: true, photoKey: true },
      });
      if (existing) {
        return {
          status: 200,
          body: {
            success: true,
            data: {
              id: existing.id,
              photoUrl: `${this.storagePublicUrl.replace(/\/$/, "")}/${existing.photoKey ?? ""}`,
              acknowledgment: "Report already received (idempotent replay).",
              isDuplicate: existing.isDuplicate,
              version: existing.version,
            },
          },
        };
      }
    }

    const normalizedPayload = {
      ...payload,
      extraFields:
        typeof payload.extraFields === "string"
          ? safeJsonParse(payload.extraFields)
          : payload.extraFields,
    };

    const parsed = submitSchema.safeParse(normalizedPayload);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const path = firstIssue?.path?.join(".");
      const message = path
        ? `${path}: ${firstIssue.message}`
        : (firstIssue?.message ?? "Invalid payload");

      return this.validationError(message, firstIssue?.path);
    }

    const data = parsed.data;

    // Check if crisis is active
    const crisis = await this.prisma.crisis.findUnique({
      where: { id: data.crisisId },
    });

    if (!crisis) {
      return {
        status: 400,
        body: {
          success: false,
          error: {
            code: ErrorCode.CRISIS_NOT_FOUND,
            message: `Crisis "${data.crisisId}" does not exist`,
          },
        },
      };
    }

    if (!crisis.isActive) {
      return {
        status: 409,
        body: {
          success: false,
          error: {
            code: ErrorCode.CRISIS_NOT_ACTIVE,
            message: `Crisis is not accepting new reports`,
          },
        },
      };
    }

    const reportId = randomUUID();
    const existingPrimary = data.buildingId
      ? await this.prisma.report.findFirst({
          where: {
            crisisId: data.crisisId,
            buildingId: data.buildingId,
            supersededById: null,
            isDuplicate: false,
          },
          orderBy: [{ version: "desc" }, { submittedAt: "desc" }],
          select: {
            id: true,
            version: true,
          },
        })
      : null;

    const latitude = data.latitude ? parseFloat(data.latitude) : undefined;
    const longitude = data.longitude ? parseFloat(data.longitude) : undefined;
    const collectedAt = new Date(data.collectedAt);

    let isDuplicate = false;
    let coordinateExistingPrimary: { id: string; version: number } | null =
      null;

    if (!data.buildingId && latitude !== undefined && longitude !== undefined) {
      // Step 1: tight duplicate check (±0.0001°, ±10 minutes)
      const probableDuplicate = await this.prisma.report.findFirst({
        where: {
          crisisId: data.crisisId,
          latitude: {
            gte: latitude - 0.0001,
            lte: latitude + 0.0001,
          },
          longitude: {
            gte: longitude - 0.0001,
            lte: longitude + 0.0001,
          },
          collectedAt: {
            gte: new Date(collectedAt.getTime() - 10 * 60 * 1000),
            lte: new Date(collectedAt.getTime() + 10 * 60 * 1000),
          },
        },
        select: { id: true },
      });
      isDuplicate = Boolean(probableDuplicate);

      // Step 2: coord-primary check (±0.0005°, 7-day window) — only if not a duplicate
      if (!isDuplicate) {
        coordinateExistingPrimary = await this.prisma.report.findFirst({
          where: {
            crisisId: data.crisisId,
            latitude: {
              gte: latitude - 0.0005,
              lte: latitude + 0.0005,
            },
            longitude: {
              gte: longitude - 0.0005,
              lte: longitude + 0.0005,
            },
            submittedAt: {
              gte: new Date(collectedAt.getTime() - 7 * 24 * 60 * 60 * 1000),
            },
            isDuplicate: false,
            supersededById: null,
          },
          orderBy: [{ version: "desc" }, { submittedAt: "desc" }],
          select: { id: true, version: true },
        });
      }
    }

    const effectivePrimary = existingPrimary ?? coordinateExistingPrimary;
    const version =
      effectivePrimary && !isDuplicate ? effectivePrimary.version + 1 : 1;

    const strippedPhoto = await this.photoProcessingService.stripExif(
      photo.buffer,
    );
    const uploadResult = await this.reportStorageService.uploadReportPhoto({
      reportId,
      imageBuffer: strippedPhoto,
      contentType: "image/jpeg",
    });

    const report = await this.prisma.report.create({
      data: {
        id: reportId,
        crisisId: data.crisisId,
        damageLevel: data.damageLevel,
        infraType: data.infraType,
        infraName: data.infraName,
        crisisType: data.crisisType,
        hasDebris: data.hasDebris === "true",
        collectedAt,
        description: data.description,
        electricityCondition: data.electricityCondition,
        healthServicesFunctioning: data.healthServicesFunctioning,
        pressingNeeds: data.pressingNeeds,
        pressingNeedsOther: data.pressingNeedsOther,
        descriptionLang: data.descriptionLang,
        extraFields: data.extraFields as Prisma.InputJsonValue,
        latitude,
        longitude,
        buildingId: data.buildingId,
        locationText: data.locationText,
        photoKey: uploadResult.photoKey,
        thumbnailKey: uploadResult.thumbnailKey ?? undefined,
        version,
        isDuplicate,
        idempotencyKey: idempotencyKey ?? null,
        ipHash: ipHash ?? null,
        deviceHash: deviceHash ?? null,
      },
    });

    if (effectivePrimary && !isDuplicate) {
      await this.prisma.report.update({
        where: { id: effectivePrimary.id },
        data: { supersededById: report.id },
      });
    }

    // Update reporter badge profile non-blockingly.
    if (data.reporterId && !isDuplicate) {
      try {
        await this.reporterService?.upsertProfile(data.reporterId);
      } catch (error) {
        this.logger.warn(
          `Failed to upsert reporter profile for ${data.reporterId}: ${error}`,
          (error as Error).stack,
        );
      }
    }

    // Enqueue jobs non-blockingly. Submit must return 201 even if jobs fail to enqueue.
    try {
      await this.queueService.enqueueAiClassification(
        reportId,
        uploadResult.photoKey,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue AI classification for report ${reportId}: ${error}`,
        (error as Error).stack,
      );
      // Non-blocking: do not fail the submit
    }

    try {
      const translationSourceText = data.description ?? "";
      for (const lang of UN_LANGUAGES) {
        await this.queueService.enqueueTranslation(
          reportId,
          translationSourceText,
          lang,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue translation for report ${reportId}: ${error}`,
        (error as Error).stack,
      );
      // Non-blocking: do not fail the submit
    }

    this.realtimeFeedService.emitReportUpdate({
      reportId: report.id,
      crisisId: data.crisisId,
      submittedAt:
        report.submittedAt instanceof Date
          ? report.submittedAt.toISOString()
          : new Date().toISOString(),
      version: report.version,
      isDuplicate: report.isDuplicate,
    });

    return {
      status: 201,
      body: {
        success: true,
        data: {
          id: report.id,
          photoUrl: `${this.storagePublicUrl.replace(/\/$/, "")}/${uploadResult.photoKey}`,
          acknowledgment: "Report received and queued for processing.",
          isDuplicate: report.isDuplicate,
          version: report.version,
        },
      },
    };
  }

  async listReportsGeoJson(query: ReportsQueryInput): Promise<{
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      id: string;
      geometry: { type: "Point"; coordinates: [number, number] } | null;
      properties: {
        crisisId: string;
        damageLevel: DamageLevel;
        submittedAt: string;
        isDuplicate: boolean;
        version: number;
        moderationStatus: ModerationStatus | null;
        infraType: string;
        infraName: string | null;
        crisisType: string;
        locationText: string | null;
      };
    }>;
    meta: {
      limit: number;
      total: number;
      nextCursor: string | null;
    };
  }> {
    const bounds = parseBounds(query.bounds);
    const cursor = decodeCursor(query.cursor);
    const pageSize = Math.min(this.maxPageSize, Math.max(1, query.limit ?? this.maxPageSize));

    const moderationStatusFilter: Prisma.ReportWhereInput | undefined = query.moderationStatus
      ? {
          moderationStatus: query.moderationStatus as ModerationStatus,
        }
      : undefined;

    const cursorFilter: Prisma.ReportWhereInput | undefined = cursor
      ? {
          OR: [
            { submittedAt: { lt: cursor.submittedAt } },
            {
              submittedAt: cursor.submittedAt,
              id: {
                lt: cursor.id,
              },
            },
          ],
        }
      : undefined;

    const baseWhere: Prisma.ReportWhereInput & {
      crisisId?: string;
      damageLevel?: DamageLevel;
      isDuplicate: boolean;
      supersededById: string | null;
      deletedAt: null;
    } = {
      isDuplicate: false,
      supersededById: null,
      deletedAt: null,
    };

    // Add optional fields only if they have values
    if (query.crisisId) baseWhere.crisisId = query.crisisId;
    if (query.damageLevel) baseWhere.damageLevel = query.damageLevel;

    // Handle date range filter
    const dateFilter: Prisma.DateTimeFilter | undefined = query.dateFrom || query.dateTo
      ? {
          gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
          lte: query.dateTo ? new Date(query.dateTo) : undefined,
        }
      : undefined;

    // Handle bounds filter
    const boundsFilter: Prisma.ReportWhereInput | undefined = bounds
      ? {
          latitude: {
            gte: bounds.south,
            lte: bounds.north,
          } as any,
          longitude: {
            gte: bounds.west,
            lte: bounds.east,
          } as any,
        }
      : undefined;

    // Combine all where conditions
    const allConditions: Prisma.ReportWhereInput[] = [baseWhere];
    if (moderationStatusFilter) allConditions.push(moderationStatusFilter);
    if (dateFilter) allConditions.push({ submittedAt: dateFilter });
    if (boundsFilter) allConditions.push(boundsFilter);
    if (cursorFilter) allConditions.push(cursorFilter);

    const countConditions = allConditions.slice(0, allConditions.length - (cursorFilter ? 1 : 0));
    const countWhere: Prisma.ReportWhereInput =
      countConditions.length === 1
        ? countConditions[0]
        : { AND: countConditions };

    const pageWhere: Prisma.ReportWhereInput =
      allConditions.length === 1 ? allConditions[0] : { AND: allConditions };

    const total = await this.prisma.report.count({ where: countWhere });

    const records = await this.prisma.report.findMany({
      where: pageWhere,
      orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      select: {
        id: true,
        crisisId: true,
        damageLevel: true,
        submittedAt: true,
        latitude: true,
        longitude: true,
        isDuplicate: true,
        version: true,
        moderationStatus: true,
        infraType: true,
        infraName: true,
        crisisType: true,
        locationText: true,
      },
    });

    const hasNextPage = records.length > pageSize;
    const page = hasNextPage ? records.slice(0, pageSize) : records;
    const nextRecord = hasNextPage ? page[page.length - 1] : null;

    return {
      type: "FeatureCollection",
      features: page.map((record) => ({
        type: "Feature",
        id: record.id,
        geometry:
          record.latitude !== null && record.longitude !== null
            ? {
                type: "Point",
                coordinates: [record.longitude, record.latitude],
              }
            : null,
        properties: {
          crisisId: record.crisisId,
          damageLevel: record.damageLevel,
          submittedAt: record.submittedAt.toISOString(),
          isDuplicate: record.isDuplicate,
          version: record.version,
          moderationStatus: record.moderationStatus,
          infraType: record.infraType,
          infraName: record.infraName ?? null,
          crisisType: record.crisisType,
          locationText: record.locationText ?? null,
        },
      })),
      meta: {
        limit: pageSize,
        total,
        nextCursor: nextRecord
          ? encodeCursor(nextRecord.id, nextRecord.submittedAt)
          : null,
      },
    };
  }

  async createExportJob(payload: ExportJobInput): Promise<{ jobId: string }> {
    const job = await this.queueService.enqueueReportsExport(payload);
    return {
      jobId: String(job.id),
    };
  }

  async getExportJobStatus(jobId: string): Promise<
    | {
        found: false;
      }
    | {
        found: true;
        body: {
          jobId: string;
          status: "queued" | "processing" | "completed" | "failed";
          url?: string;
          expiresAt?: string;
          error?: string;
        };
      }
  > {
    const job = await this.queueService.getReportsExportJob(jobId);

    if (!job) {
      return { found: false };
    }

    const state = await job.getState();
    if (state === "completed") {
      const objectKey = (job.returnvalue as { objectKey?: string } | null)
        ?.objectKey;
      if (!objectKey) {
        return {
          found: true,
          body: {
            jobId,
            status: "failed",
            error: "missing export object key",
          },
        };
      }

      const expiresInSeconds = 24 * 60 * 60;
      const url = await this.reportStorageService.createSignedDownloadUrl(
        objectKey,
        expiresInSeconds,
      );
      const expiresAt = new Date(
        Date.now() + expiresInSeconds * 1000,
      ).toISOString();
      return {
        found: true,
        body: {
          jobId,
          status: "completed",
          url,
          expiresAt,
        },
      };
    }

    if (state === "active") {
      return {
        found: true,
        body: {
          jobId,
          status: "processing",
        },
      };
    }

    if (state === "failed") {
      return {
        found: true,
        body: {
          jobId,
          status: "failed",
          error: job.failedReason ?? "Export failed",
        },
      };
    }

    return {
      found: true,
      body: {
        jobId,
        status: "queued",
      },
    };
  }

  async getReportHistory(reportId: string): Promise<
    | {
        found: false;
      }
    | {
        found: true;
        body: {
          success: true;
          data: ReportVersionSummary[];
        };
      }
  > {
    const target = await this.prisma.report.findFirst({
      where: { id: reportId, deletedAt: null },
      select: {
        id: true,
        crisisId: true,
        buildingId: true,
        latitude: true,
        longitude: true,
        supersededById: true,
      },
    });

    if (!target) {
      return { found: false };
    }

    const COORD_RADIUS = 0.0005;
    const historyRecords = await this.prisma.report.findMany({
      where: target.buildingId
        ? {
            crisisId: target.crisisId,
            buildingId: target.buildingId,
            deletedAt: null,
          }
        : target.latitude !== null && target.longitude !== null
          ? {
              crisisId: target.crisisId,
              latitude: {
                gte: target.latitude - COORD_RADIUS,
                lte: target.latitude + COORD_RADIUS,
              },
              longitude: {
                gte: target.longitude - COORD_RADIUS,
                lte: target.longitude + COORD_RADIUS,
              },
              deletedAt: null,
            }
          : {
              id: target.id,
              deletedAt: null,
            },
      orderBy: [{ version: "desc" }, { submittedAt: "desc" }],
      select: {
        id: true,
        version: true,
        damageLevel: true,
        submittedAt: true,
        supersededById: true,
      },
    });

    return {
      found: true,
      body: {
        success: true,
        data: historyRecords.map((record) => ({
          id: record.id,
          version: record.version,
          damageLevel: record.damageLevel,
          submittedAt: record.submittedAt.toISOString(),
          isCurrent: record.supersededById === null,
        })),
      },
    };
  }

  async getById(id: string): Promise<
    | { found: false }
    | {
        found: true;
        body: {
          success: true;
          data: {
            id: string;
            crisisId: string;
            damageLevel: DamageLevel;
            infraType: InfraType;
            infraName: string | null;
            crisisType: CrisisType;
            hasDebris: boolean;
            collectedAt: string | null;
            description: string | null;
            electricityCondition: ElectricityCondition;
            healthServicesFunctioning: HealthServicesFunctioning;
            pressingNeeds: PressingNeed[];
            pressingNeedsOther: string | null;
            descriptionLang: string | null;
            latitude: number | null;
            longitude: number | null;
            locationText: string | null;
            buildingId: string | null;
            photoUrl: string | null;
            submittedAt: string;
            isDuplicate: boolean;
            version: number;
            supersededById: string | null;
            extraFields: Record<string, unknown>;
          };
        };
      }
  > {
    const report = await this.prisma.report.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        crisisId: true,
        damageLevel: true,
        infraType: true,
        infraName: true,
        crisisType: true,
        hasDebris: true,
        collectedAt: true,
        description: true,
        electricityCondition: true,
        healthServicesFunctioning: true,
        pressingNeeds: true,
        pressingNeedsOther: true,
        descriptionLang: true,
        latitude: true,
        longitude: true,
        locationText: true,
        buildingId: true,
        photoKey: true,
        submittedAt: true,
        isDuplicate: true,
        version: true,
        supersededById: true,
        extraFields: true,
      },
    });

    if (!report) {
      return { found: false };
    }

    return {
      found: true,
      body: {
        success: true,
        data: {
          id: report.id,
          crisisId: report.crisisId,
          damageLevel: report.damageLevel,
          infraType: report.infraType,
          infraName: report.infraName,
          crisisType: report.crisisType,
          hasDebris: report.hasDebris,
          collectedAt: report.collectedAt?.toISOString() ?? null,
          description: report.description,
          electricityCondition: report.electricityCondition,
          healthServicesFunctioning: report.healthServicesFunctioning,
          pressingNeeds: report.pressingNeeds,
          pressingNeedsOther: report.pressingNeedsOther,
          descriptionLang: report.descriptionLang,
          latitude: report.latitude,
          longitude: report.longitude,
          locationText: report.locationText,
          buildingId: report.buildingId,
          photoUrl: report.photoKey
            ? `${this.storagePublicUrl.replace(/\/$/, "")}/${report.photoKey}`
            : null,
          submittedAt: report.submittedAt.toISOString(),
          isDuplicate: report.isDuplicate,
          version: report.version,
          supersededById: report.supersededById,
          extraFields: report.extraFields as Record<string, unknown>,
        },
      },
    };
  }

  async moderate(
    id: string,
    input: {
      moderationStatus: ModerationStatus;
      moderationNote?: string;
      moderatedBy: string;
    },
  ): Promise<
    | { found: false }
    | {
        found: true;
        body: {
          success: true;
          data: {
            id: string;
            moderationStatus: ModerationStatus;
            moderationNote: string | null;
            moderatedAt: string;
            moderatedBy: string;
          };
        };
      }
  > {
    const existing = await this.prisma.report.findUnique({
      where: { id },
      select: {
        id: true,
        moderationStatus: true,
        moderationNote: true,
      },
    });

    if (!existing) {
      return { found: false };
    }

    const moderatedAt = new Date();
    const newValue = {
      moderationStatus: input.moderationStatus,
      moderationNote: input.moderationNote ?? null,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedReport = await tx.report.update({
        where: { id },
        data: {
          moderationStatus: input.moderationStatus,
          moderationNote: input.moderationNote ?? null,
          moderatedAt,
          moderatedBy: input.moderatedBy,
        },
        select: {
          id: true,
          moderationStatus: true,
          moderationNote: true,
          moderatedAt: true,
          moderatedBy: true,
        },
      });

      await tx.auditLog.create({
        data: {
          reportId: id,
          action: AuditAction.REPORT_MODERATION_UPDATED,
          actorId: input.moderatedBy,
          previousValue: {
            moderationStatus: existing.moderationStatus,
            moderationNote: existing.moderationNote,
          },
          newValue,
        },
      });

      return updatedReport;
    });

    return {
      found: true,
      body: {
        success: true,
        data: {
          id: updated.id,
          moderationStatus: updated.moderationStatus,
          moderationNote: updated.moderationNote,
          moderatedAt: updated.moderatedAt!.toISOString(),
          moderatedBy: updated.moderatedBy!,
        },
      },
    };
  }

  async softDelete(
    id: string,
    actorId: string,
  ): Promise<{ found: false } | { found: true }> {
    const result = await softDeleteReport({
      prisma: this.prisma,
      reportStorageService: this.reportStorageService,
      reportId: id,
      actorId,
    });

    if (!result.found) {
      return { found: false };
    }

    return { found: true };
  }

  async anonymize(
    id: string,
    actorId: string,
  ): Promise<
    | { found: false }
    | {
        found: true;
        body: {
          success: true;
          data: {
            id: string;
            anonymizedAt: string;
          };
        };
      }
  > {
    const result = await anonymizeReport({
      prisma: this.prisma,
      reportId: id,
      actorId,
    });

    if (!result.found) {
      return { found: false };
    }

    return {
      found: true,
      body: {
        success: true,
        data: {
          id,
          anonymizedAt: result.anonymizedAt.toISOString(),
        },
      },
    };
  }

  async getModerationAudit(
    id: string,
    input: {
      page: number;
      pageSize: number;
    },
  ): Promise<
    | { found: false }
    | {
        found: true;
        body: {
          success: true;
          data: {
            items: Array<{
              id: string;
              reportId: string;
              action: AuditAction;
              actorId: string;
              previousValue: Record<string, unknown>;
              newValue: Record<string, unknown>;
              createdAt: string;
            }>;
            pagination: {
              page: number;
              pageSize: number;
              totalItems: number;
              totalPages: number;
            };
          };
        };
      }
  > {
    const report = await this.prisma.report.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!report) {
      return { found: false };
    }

    const page = Math.max(1, input.page);
    const pageSize = Math.min(this.maxPageSize, Math.max(1, input.pageSize));
    const skip = (page - 1) * pageSize;

    const [totalItems, entries] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where: { reportId: id } }),
      this.prisma.auditLog.findMany({
        where: { reportId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
      }),
    ]);

    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);

    return {
      found: true,
      body: {
        success: true,
        data: {
          items: entries.map((entry) => ({
            id: entry.id,
            reportId: entry.reportId,
            action: entry.action,
            actorId: entry.actorId,
            previousValue: entry.previousValue as Record<string, unknown>,
            newValue: entry.newValue as Record<string, unknown>,
            createdAt: entry.createdAt.toISOString(),
          })),
          pagination: {
            page,
            pageSize,
            totalItems,
            totalPages,
          },
        },
      },
    };
  }

  private validationError(
    message: string,
    path?: PropertyKey[],
  ): { status: number; body: ErrorEnvelope } {
    return {
      status: 400,
      body: {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message,
          details: {
            path,
          },
        },
      },
    };
  }
}

function parseBounds(bounds: string | undefined): {
  south: number;
  west: number;
  north: number;
  east: number;
} | null {
  if (!bounds) {
    return null;
  }

  const parts = bounds.split(",").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((value) => Number.isNaN(value))) {
    return null;
  }

  return {
    south: parts[0],
    west: parts[1],
    north: parts[2],
    east: parts[3],
  };
}

function encodeCursor(id: string, submittedAt: Date): string {
  return Buffer.from(
    JSON.stringify({
      id,
      submittedAt: submittedAt.toISOString(),
    }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(
  cursor: string | undefined,
): { id: string; submittedAt: Date } | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { id?: string; submittedAt?: string };
    if (!parsed.id || !parsed.submittedAt) {
      return null;
    }

    const submittedAt = new Date(parsed.submittedAt);
    if (Number.isNaN(submittedAt.valueOf())) {
      return null;
    }

    return {
      id: parsed.id,
      submittedAt,
    };
  } catch {
    return null;
  }
}

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
