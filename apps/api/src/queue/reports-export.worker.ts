import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, OnApplicationShutdown } from "@nestjs/common";
import type { Job } from "bullmq";
import {
  DamageLevel,
  ElectricityCondition,
  HealthServicesFunctioning,
  ModerationStatus,
  PressingNeed,
} from "@prisma/client";
import { zip as writeShapefileZip } from "@mapbox/shp-write";
import { Readable } from "node:stream";
import { PrismaService } from "../prisma/prisma.service";
import { ReportStorageService } from "../reports/report-storage.service";
import { RealtimeFeedService } from "../reports/realtime-feed.service";
import { EXPORT_QUEUE } from "./queue.constants";

type ReportsExportJobData = {
  crisisId?: string;
  format: "csv" | "geojson" | "shapefile";
  dateFrom?: string;
  dateTo?: string;
  bounds?: string;
};

type ExportReportRow = {
  id: string;
  crisisId: string;
  damageLevel: DamageLevel;
  infraType: string;
  infraName: string | null;
  crisisType: string;
  hasDebris: boolean;
  collectedAt: Date | null;
  description: string | null;
  descriptionLang: string | null;
  extraFields: unknown;
  electricityCondition: ElectricityCondition;
  healthServicesFunctioning: HealthServicesFunctioning;
  pressingNeeds: PressingNeed[];
  photoKey: string | null;
  thumbnailKey: string | null;
  latitude: number | null;
  longitude: number | null;
  buildingId: string | null;
  locationText: string | null;
  aiDamageLevel: DamageLevel | null;
  aiConfidence: number | null;
  aiAnalyzedAt: Date | null;
  moderationStatus: ModerationStatus;
  moderationNote: string | null;
  moderatedAt: Date | null;
  moderatedBy: string | null;
  version: number;
  supersededById: string | null;
  deviceHash: string | null;
  ipHash: string | null;
  isDuplicate: boolean;
  isVerified: boolean;
  submittedAt: Date;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const EXPORT_CHUNK_SIZE = 500;

const EXPORT_REPORT_SELECT = {
  id: true,
  crisisId: true,
  damageLevel: true,
  infraType: true,
  infraName: true,
  crisisType: true,
  hasDebris: true,
  collectedAt: true,
  description: true,
  descriptionLang: true,
  extraFields: true,
  electricityCondition: true,
  healthServicesFunctioning: true,
  pressingNeeds: true,
  photoKey: true,
  thumbnailKey: true,
  latitude: true,
  longitude: true,
  buildingId: true,
  locationText: true,
  aiDamageLevel: true,
  aiConfidence: true,
  aiAnalyzedAt: true,
  moderationStatus: true,
  moderationNote: true,
  moderatedAt: true,
  moderatedBy: true,
  version: true,
  supersededById: true,
  deviceHash: true,
  ipHash: true,
  isDuplicate: true,
  isVerified: true,
  submittedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Processor(EXPORT_QUEUE)
export class ReportsExportWorker
  extends WorkerHost
  implements OnApplicationShutdown
{
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportStorageService)
    private readonly reportStorageService: ReportStorageService,
    @Inject(RealtimeFeedService)
    private readonly realtimeFeedService: RealtimeFeedService,
  ) {
    super();
  }

  async process(
    job: Job<ReportsExportJobData>,
  ): Promise<{ objectKey: string }> {
    const objectKey = buildObjectKey(String(job.id), job.data.format);
    const exportFile = await buildExportFile(
      this.prisma,
      job.data,
      job.data.format,
    );

    await this.reportStorageService.uploadExportFile({
      objectKey,
      content: exportFile.content,
      contentType: exportFile.contentType,
    });

    // Notify SSE subscribers that the export is ready for download.
    const expiresInSeconds = 24 * 60 * 60;
    const downloadUrl = await this.reportStorageService.createSignedDownloadUrl(
      objectKey,
      expiresInSeconds,
    );
    this.realtimeFeedService.emitExportComplete({
      jobId: String(job.id),
      crisisId: job.data.crisisId ?? "__all__",
      downloadUrl,
    });

    return { objectKey };
  }

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.worker.close();
    } catch {
      // Worker may not be initialized in isolated unit/e2e contexts.
    }
  }
}

function buildWhere(data: ReportsExportJobData) {
  const bounds = parseBounds(data.bounds);
  return {
    ...(data.crisisId ? { crisisId: data.crisisId } : {}),
    isDuplicate: false,
    supersededById: null,
    submittedAt: {
      gte: data.dateFrom ? new Date(data.dateFrom) : undefined,
      lte: data.dateTo ? new Date(data.dateTo) : undefined,
    },
    latitude: bounds
      ? {
          gte: bounds.south,
          lte: bounds.north,
        }
      : undefined,
    longitude: bounds
      ? {
          gte: bounds.west,
          lte: bounds.east,
        }
      : undefined,
  };
}

function buildObjectKey(
  jobId: string,
  format: ReportsExportJobData["format"],
): string {
  if (format === "csv") {
    return `exports/${jobId}.csv`;
  }

  if (format === "geojson") {
    return `exports/${jobId}.geojson`;
  }

  return `exports/${jobId}.zip`;
}

async function buildExportFile(
  prisma: PrismaService,
  data: ReportsExportJobData,
  format: ReportsExportJobData["format"],
): Promise<{ content: Buffer | Readable; contentType: string }> {
  if (format === "csv") {
    return {
      content: Readable.from(streamCsvContent(prisma, data)),
      contentType: "text/csv",
    };
  }

  if (format === "geojson") {
    return {
      content: Readable.from(streamGeoJsonContent(prisma, data)),
      contentType: "application/geo+json",
    };
  }

  const rows = await collectExportRows(prisma, data);
  const zipBuffer = await toShapefileZip(rows);
  return {
    content: zipBuffer,
    contentType: "application/zip",
  };
}

async function collectExportRows(
  prisma: PrismaService,
  data: ReportsExportJobData,
): Promise<ExportReportRow[]> {
  const rows: ExportReportRow[] = [];

  for await (const chunk of iterateExportRowChunks(prisma, data)) {
    rows.push(...chunk);
  }

  return rows;
}

async function* iterateExportRowChunks(
  prisma: PrismaService,
  data: ReportsExportJobData,
): AsyncGenerator<ExportReportRow[]> {
  let cursor: string | undefined;

  while (true) {
    const chunk = await prisma.report.findMany({
      where: buildWhere(data),
      orderBy: { id: "asc" },
      take: EXPORT_CHUNK_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: EXPORT_REPORT_SELECT,
    });

    if (chunk.length === 0) {
      return;
    }

    yield chunk;

    if (chunk.length < EXPORT_CHUNK_SIZE) {
      return;
    }

    cursor = chunk[chunk.length - 1].id;
  }
}

async function* streamCsvContent(
  prisma: PrismaService,
  data: ReportsExportJobData,
): AsyncGenerator<string> {
  yield `${CSV_HEADER}\n`;

  for await (const chunk of iterateExportRowChunks(prisma, data)) {
    yield `${chunk.map((row) => toCsvRow(row)).join("\n")}\n`;
  }
}

async function* streamGeoJsonContent(
  prisma: PrismaService,
  data: ReportsExportJobData,
): AsyncGenerator<string> {
  yield '{"type":"FeatureCollection","features":[';

  let first = true;
  for await (const chunk of iterateExportRowChunks(prisma, data)) {
    const serializedChunk = chunk
      .map((row) => JSON.stringify(toGeoJsonFeature(row)))
      .join(",");

    if (!serializedChunk) {
      continue;
    }

    yield `${first ? "" : ","}${serializedChunk}`;
    first = false;
  }

  yield "]}";
}

async function toShapefileZip(rows: ExportReportRow[]): Promise<Buffer> {
  const featureCollection = {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      id: row.id,
      geometry:
        row.latitude !== null && row.longitude !== null
          ? {
              type: "Point",
              coordinates: [row.longitude, row.latitude] as [number, number],
            }
          : null,
      properties: {
        crisisId: row.crisisId,
        damageLevel: row.damageLevel,
        infraType: row.infraType,
        infraName: row.infraName,
        crisisType: row.crisisType,
        hasDebris: row.hasDebris,
        collectedAt: toIso(row.collectedAt),
        description: row.description,
        descriptionLang: row.descriptionLang,
        extraFields: toJsonString(row.extraFields),
        electricityCondition: row.electricityCondition,
        healthServicesFunctioning: row.healthServicesFunctioning,
        pressingNeeds: row.pressingNeeds.join("|"),
        photoKey: row.photoKey,
        thumbnailKey: row.thumbnailKey,
        latitude: row.latitude,
        longitude: row.longitude,
        buildingId: row.buildingId,
        locationText: row.locationText,
        aiDamageLevel: row.aiDamageLevel,
        aiConfidence: row.aiConfidence,
        aiAnalyzedAt: toIso(row.aiAnalyzedAt),
        moderationStatus: row.moderationStatus,
        moderationNote: row.moderationNote,
        moderatedAt: toIso(row.moderatedAt),
        moderatedBy: row.moderatedBy,
        version: row.version,
        supersededById: row.supersededById,
        deviceHash: row.deviceHash,
        ipHash: row.ipHash,
        isDuplicate: row.isDuplicate,
        isVerified: row.isVerified,
        submittedAt: row.submittedAt.toISOString(),
        deletedAt: toIso(row.deletedAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    })),
  } as const;

  const zipped = await writeShapefileZip<"nodebuffer">(featureCollection, {
    outputType: "nodebuffer",
    compression: "STORE",
  });
  return zipped;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

const CSV_HEADER =
  "id,crisisId,damageLevel,electricityCondition,healthServicesFunctioning,pressingNeeds,latitude,longitude,submittedAt";

function toCsvRow(row: ExportReportRow): string {
  return [
    row.id,
    row.crisisId,
    row.damageLevel,
    row.electricityCondition,
    row.healthServicesFunctioning,
    row.pressingNeeds.join("|"),
    row.latitude ?? "",
    row.longitude ?? "",
    row.submittedAt.toISOString(),
  ].join(",");
}

function toGeoJsonFeature(row: ExportReportRow) {
  return {
    type: "Feature",
    id: row.id,
    geometry:
      row.latitude !== null && row.longitude !== null
        ? {
            type: "Point",
            coordinates: [row.longitude, row.latitude] as [number, number],
          }
        : null,
    properties: {
      crisisId: row.crisisId,
      damageLevel: row.damageLevel,
      electricityCondition: row.electricityCondition,
      healthServicesFunctioning: row.healthServicesFunctioning,
      pressingNeeds: row.pressingNeeds,
      submittedAt: row.submittedAt.toISOString(),
    },
  };
}

function toJsonString(value: unknown): string | null {
  if (typeof value === "undefined" || value === null) {
    return null;
  }

  return JSON.stringify(value);
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

  // API/UI contract for bounds is minLng,minLat,maxLng,maxLat.
  const [westRaw, southRaw, eastRaw, northRaw] = bounds.split(",");
  const south = Number(southRaw);
  const west = Number(westRaw);
  const north = Number(northRaw);
  const east = Number(eastRaw);

  if (![south, west, north, east].every((value) => Number.isFinite(value))) {
    return null;
  }

  return { south, west, north, east };
}
