import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Query,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import * as crypto from "crypto";

import {
  ApiBearerAuth,
  ApiBody,
  ApiBadRequestResponse,
  ApiAcceptedResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { ErrorCode } from "../common/error-codes";
import { ReportsService } from "./reports.service";
import type { UploadedPhoto } from "./reports.service";
import {
  CrisisType,
  DamageLevel,
  ElectricityCondition,
  HealthServicesFunctioning,
  InfraType,
  ModerationStatus,
  PressingNeed,
} from "@prisma/client";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles, Role } from "../auth/roles.decorator";
import { RealtimeFeedService } from "./realtime-feed.service";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";
import { ReportSubmitThrottlerGuard } from "./report-submit-throttler.guard";
import { AuthGuard, OptionalAuth } from "@thallesp/nestjs-better-auth";

class CreateReportMultipartDto {
  @ApiProperty({ type: "string", format: "binary" })
  photo!: unknown;

  @ApiProperty({ type: String })
  crisisId!: string;

  @ApiProperty({ enum: Object.values(DamageLevel) })
  damageLevel!: string;

  @ApiProperty({ enum: Object.values(InfraType) })
  infraType!: string;

  @ApiProperty({ enum: Object.values(CrisisType) })
  crisisType!: string;

  @ApiProperty({ type: String })
  hasDebris!: string;

  @ApiProperty({ type: String, format: "date-time" })
  collectedAt!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({
    enum: Object.values(ElectricityCondition),
    description: "Electricity infrastructure condition (UNDP Appendix 1)",
  })
  electricityCondition!: string;

  @ApiProperty({
    enum: Object.values(HealthServicesFunctioning),
    description: "Health services functioning status (UNDP Appendix 1)",
  })
  healthServicesFunctioning!: string;

  @ApiProperty({
    type: String,
    enum: Object.values(PressingNeed),
    isArray: true,
    description:
      'JSON-serialized array of PressingNeed enum values, e.g. ["FOOD_WATER","SHELTER_REPAIR"] (UNDP Appendix 1)',
    example: '["FOOD_WATER","SHELTER_REPAIR"]',
  })
  pressingNeeds!: string;

  @ApiPropertyOptional({
    type: String,
    description:
      "Free-text description of other pressing needs (required when OTHER is selected)",
    maxLength: 500,
  })
  pressingNeedsOther?: string;

  @ApiPropertyOptional({
    type: String,
    example: "ar",
    description: "BCP-47 language tag for the submitted description",
  })
  descriptionLang?: string;

  @ApiPropertyOptional({
    type: String,
    description: "JSON-serialized object of additional crisis-specific fields",
  })
  extraFields?: string;

  @ApiPropertyOptional({ type: String })
  latitude?: string;

  @ApiPropertyOptional({ type: String })
  longitude?: string;

  @ApiPropertyOptional({ type: String })
  locationText?: string;

  @ApiPropertyOptional({ type: String })
  buildingId?: string;

  @ApiProperty({ type: String })
  infraName!: string;

  @ApiPropertyOptional({
    type: String,
    description:
      "Optional reporter identifier for attributing submissions to a badge profile.",
  })
  reporterId?: string;
}

class CreateExportRequestDto {
  @ApiPropertyOptional({
    type: String,
    example: "550e8400-e29b-41d4-a716-446655440000",
    description:
      "UUID of the crisis to export reports for. Optional for admins when exporting across all crises with a bounded date range.",
  })
  crisisId?: string;

  @ApiProperty({
    enum: ["csv", "geojson", "shapefile"],
    example: "csv",
    description:
      "Output format. csv gives a flat spreadsheet; geojson gives a FeatureCollection suitable for GIS tools; shapefile gives a zipped ESRI shapefile.",
  })
  format!: "csv" | "geojson" | "shapefile";

  @ApiPropertyOptional({
    type: String,
    example: "2024-01-01T00:00:00Z",
    description:
      "ISO 8601 date-time — include only reports collected on or after this date",
  })
  dateFrom?: string;

  @ApiPropertyOptional({
    type: String,
    example: "2024-12-31T23:59:59Z",
    description:
      "ISO 8601 date-time — include only reports collected on or before this date",
  })
  dateTo?: string;

  @ApiPropertyOptional({
    type: String,
    example: "34.7,31.5,35.9,33.0",
    description:
      'Bounding box filter as "minLng,minLat,maxLng,maxLat" (WGS-84)',
  })
  bounds?: string;
}

class ExportJobStatusDto {
  @ApiProperty({
    type: String,
    example: "42",
    description: "Export job ID (use in GET /reports/export/:jobId)",
  })
  jobId!: string;

  @ApiProperty({
    enum: ["queued", "processing", "completed", "failed"],
    example: "queued",
    description: "Current job state",
  })
  status!: string;

  @ApiPropertyOptional({
    type: String,
    example: "https://storage.example.com/exports/file.csv?X-Amz-Signature=...",
    description:
      'Pre-signed download URL (present only when status is "completed")',
  })
  url?: string;

  @ApiPropertyOptional({
    type: String,
    format: "date-time",
    description: "Expiry time of the download URL (ISO 8601)",
  })
  expiresAt?: string;
}

class ExportJobQueuedDto {
  @ApiProperty({
    type: String,
    example: "42",
    description:
      "Export job ID — poll GET /reports/export/:jobId for status and download URL",
  })
  jobId!: string;
}

class ReportGeoJsonPointGeometryDto {
  @ApiProperty({ enum: ["Point"] })
  type!: "Point";

  @ApiProperty({
    type: [Number],
    minItems: 2,
    maxItems: 2,
    example: [36.16, 36.2],
  })
  coordinates!: [number, number];
}

class ReportGeoJsonPropertiesDto {
  @ApiProperty({ type: String, format: "uuid" })
  crisisId!: string;

  @ApiProperty({ enum: Object.values(DamageLevel) })
  damageLevel!: DamageLevel;

  @ApiProperty({ type: String, format: "date-time" })
  submittedAt!: string;

  @ApiProperty({ type: Boolean })
  isDuplicate!: boolean;

  @ApiProperty({ type: Number, minimum: 1 })
  version!: number;

  @ApiProperty({ enum: Object.values(InfraType) })
  infraType!: InfraType;

  @ApiProperty({ type: String, nullable: true })
  locationText!: string | null;
}

class ReportGeoJsonFeatureDto {
  @ApiProperty({ enum: ["Feature"] })
  type!: "Feature";

  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: ReportGeoJsonPointGeometryDto, nullable: true })
  geometry!: ReportGeoJsonPointGeometryDto | null;

  @ApiProperty({ type: ReportGeoJsonPropertiesDto })
  properties!: ReportGeoJsonPropertiesDto;
}

class ReportGeoJsonMetaDto {
  @ApiProperty({ type: Number, minimum: 1, example: 100 })
  limit!: number;

  @ApiProperty({ type: Number, minimum: 0, example: 87 })
  total!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "Opaque cursor for fetching the next page of reports",
  })
  nextCursor!: string | null;
}

class ReportGeoJsonFeatureCollectionDto {
  @ApiProperty({ enum: ["FeatureCollection"] })
  type!: "FeatureCollection";

  @ApiProperty({ type: [ReportGeoJsonFeatureDto] })
  features!: ReportGeoJsonFeatureDto[];

  @ApiProperty({ type: ReportGeoJsonMetaDto })
  meta!: ReportGeoJsonMetaDto;
}

class ReportHistoryEntryDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  version!: number;

  @ApiProperty({ enum: Object.values(DamageLevel) })
  damageLevel!: DamageLevel;

  @ApiProperty({ type: String, format: "date-time" })
  submittedAt!: string;

  @ApiProperty({ type: Boolean })
  isCurrent!: boolean;
}

class ReportHistoryResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: [ReportHistoryEntryDto] })
  data!: ReportHistoryEntryDto[];
}

class ReportDetailDataDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  crisisId!: string;

  @ApiProperty({ enum: Object.values(DamageLevel) })
  damageLevel!: DamageLevel;

  @ApiProperty({ enum: Object.values(InfraType) })
  infraType!: InfraType;

  @ApiPropertyOptional({ type: String, nullable: true })
  infraName!: string | null;

  @ApiProperty({ enum: Object.values(CrisisType) })
  crisisType!: CrisisType;

  @ApiProperty({ type: Boolean })
  hasDebris!: boolean;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  collectedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: Object.values(ElectricityCondition) })
  electricityCondition!: ElectricityCondition;

  @ApiProperty({ enum: Object.values(HealthServicesFunctioning) })
  healthServicesFunctioning!: HealthServicesFunctioning;

  @ApiProperty({
    type: String,
    enum: Object.values(PressingNeed),
    isArray: true,
  })
  pressingNeeds!: PressingNeed[];

  @ApiPropertyOptional({ type: String, nullable: true })
  pressingNeedsOther!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  descriptionLang!: string | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  latitude!: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  longitude!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  locationText!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  buildingId!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  photoUrl!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  submittedAt!: string;

  @ApiProperty({ type: Boolean })
  isDuplicate!: boolean;

  @ApiProperty({ type: Number, minimum: 1 })
  version!: number;

  @ApiPropertyOptional({ type: String, nullable: true })
  supersededById!: string | null;

  @ApiProperty({
    type: "object",
    additionalProperties: true,
    properties: {
      translations: {
        type: "object",
        additionalProperties: { type: "string" },
      },
    },
  })
  extraFields!: Record<string, unknown>;
}

class ReportDetailResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: ReportDetailDataDto })
  data!: ReportDetailDataDto;
}

class SubmitReportDataDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  photoUrl!: string;

  @ApiProperty({ type: String })
  acknowledgment!: string;

  @ApiProperty({ type: Boolean })
  isDuplicate!: boolean;

  @ApiProperty({ type: Number, minimum: 1 })
  version!: number;
}

class SubmitReportResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: SubmitReportDataDto })
  data!: SubmitReportDataDto;
}

class ReportAnonymizeDataDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "date-time" })
  anonymizedAt!: string;
}

class ReportAnonymizeResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: ReportAnonymizeDataDto })
  data!: ReportAnonymizeDataDto;
}

class ReportModerationDataDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ enum: Object.values(ModerationStatus) })
  moderationStatus!: ModerationStatus;

  @ApiPropertyOptional({ type: String, nullable: true })
  moderationNote!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  moderatedAt!: string;

  @ApiProperty({ type: String })
  moderatedBy!: string;
}

class ReportModerationResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: ReportModerationDataDto })
  data!: ReportModerationDataDto;
}

class ModerateReportDto {
  @ApiProperty({
    enum: Object.values(ModerationStatus),
    description: "New moderation status for the report",
    example: "FLAGGED",
  })
  moderationStatus!: string;

  @ApiPropertyOptional({
    type: String,
    description: "Optional note explaining the moderation decision",
    example: "Suspected duplicate — same building reported 10 minutes earlier",
  })
  moderationNote?: string;
}

class ModerationAuditEntryDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  reportId!: string;

  @ApiProperty({ type: String, example: "REPORT_MODERATION_UPDATED" })
  action!: string;

  @ApiProperty({ type: String, example: "admin-user" })
  actorId!: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  previousValue!: Record<string, unknown>;

  @ApiProperty({ type: "object", additionalProperties: true })
  newValue!: Record<string, unknown>;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

class ModerationAuditPaginationDto {
  @ApiProperty({ type: Number, minimum: 1, example: 1 })
  page!: number;

  @ApiProperty({ type: Number, minimum: 1, example: 20 })
  pageSize!: number;

  @ApiProperty({ type: Number, minimum: 0, example: 2 })
  totalItems!: number;

  @ApiProperty({ type: Number, minimum: 0, example: 1 })
  totalPages!: number;
}

class ModerationAuditResponseDto {
  @ApiProperty({
    type: [ModerationAuditEntryDto],
  })
  items!: ModerationAuditEntryDto[];

  @ApiProperty({ type: ModerationAuditPaginationDto })
  pagination!: ModerationAuditPaginationDto;
}

@ApiTags("reports")
@ApiExtraModels(
  CreateReportMultipartDto,
  CreateExportRequestDto,
  ExportJobStatusDto,
  ExportJobQueuedDto,
  ReportGeoJsonPointGeometryDto,
  ReportGeoJsonPropertiesDto,
  ReportGeoJsonFeatureDto,
  ReportGeoJsonMetaDto,
  ReportGeoJsonFeatureCollectionDto,
  ReportHistoryEntryDto,
  ReportHistoryResponseDto,
  ReportDetailDataDto,
  ReportDetailResponseDto,
  SubmitReportDataDto,
  SubmitReportResponseDto,
  ReportAnonymizeDataDto,
  ReportAnonymizeResponseDto,
  ReportModerationDataDto,
  ReportModerationResponseDto,
  ModerateReportDto,
  ModerationAuditEntryDto,
  ModerationAuditPaginationDto,
  ModerationAuditResponseDto,
)
@Controller("reports")
export class ReportsController {
  private readonly maxAllCrisesStreamingRangeMs = 365 * 24 * 60 * 60 * 1000;
  private readonly maxAllCrisesShapefileRangeMs = 30 * 24 * 60 * 60 * 1000;

  constructor(
    @Inject(ReportsService) private readonly reportsService: ReportsService,
    @Inject(RealtimeFeedService)
    private readonly realtimeFeedService: RealtimeFeedService,
  ) {}

  @Get("stream")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ANALYST, Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @ApiOperation({
    summary: "Subscribe to realtime report and export updates (SSE)",
    description:
      "Server-Sent Events stream for a given crisis.\n\n" +
      "**Events emitted:**\n" +
      "- `ready` — connection established\n" +
      "- `report.updated` — new/updated damage report\n" +
      "- `export.complete` — export job finished; includes `url` and `expiresAt`\n" +
      "- `: heartbeat` comment — keepalive every 15 s",
  })
  @ApiQuery({ name: "crisisId", required: true, type: String })
  @ApiBadRequestResponse({ description: "Validation error" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  streamReports(
    @Query("crisisId") crisisId: string | undefined,
    @Res() response: Response,
  ): void {
    if (!crisisId) {
      response.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "crisisId is required",
        },
      });
      return;
    }

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    response.write(`event: ready\ndata: ${JSON.stringify({ crisisId })}\n\n`);

    const unsubscribe = this.realtimeFeedService.subscribe(
      crisisId,
      (event) => {
        response.write(
          `event: report.updated\ndata: ${JSON.stringify(event)}\n\n`,
        );
      },
    );

    const unsubscribeExport = this.realtimeFeedService.subscribeExportComplete(
      crisisId,
      (event) => {
        response.write(
          `event: export.complete\ndata: ${JSON.stringify(event)}\n\n`,
        );
      },
    );

    const heartbeat = setInterval(() => {
      response.write(": heartbeat\n\n");
    }, 15000);

    response.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribeExport();
      response.end();
    });
  }

  @Get("stream/public")
  @ApiOperation({
    summary: "Subscribe to realtime report updates (SSE) — unauthenticated",
    description:
      "Public Server-Sent Events stream for community reporters. No authentication required.\n\n" +
      "**Events emitted:**\n" +
      "- `ready` — connection established\n" +
      "- `report.updated` — new/updated damage report\n" +
      "- `: heartbeat` comment — keepalive every 15 s",
  })
  @ApiQuery({ name: "crisisId", required: true, type: String })
  @ApiResponse({
    status: 200,
    description: "SSE stream established successfully",
    content: {
      "text/event-stream": {
        schema: {
          type: "string",
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: "Validation error" })
  streamReportsPublic(
    @Query("crisisId") crisisId: string | undefined,
    @Res() response: Response,
  ): void {
    if (!crisisId) {
      response.status(400).json({
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "crisisId is required",
        },
      });
      return;
    }

    response.setHeader("Content-Type", "text/event-stream");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    response.write(`event: ready\ndata: ${JSON.stringify({ crisisId })}\n\n`);

    const unsubscribe = this.realtimeFeedService.subscribe(
      crisisId,
      (event) => {
        response.write(
          `event: report.updated\ndata: ${JSON.stringify(event)}\n\n`,
        );
      },
    );

    const heartbeat = setInterval(() => {
      response.write(": heartbeat\n\n");
    }, 15000);

    response.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      response.end();
    });
  }

  @Get()
  @UseGuards(AuthGuard)
  @OptionalAuth()
  @ApiOperation({ summary: "List reports as GeoJSON" })
  @ApiQuery({ name: "crisisId", required: false, type: String, description: "Filter by crisis. If omitted, `bounds` is required (unless caller is admin)." })
  @ApiQuery({ name: "bounds", required: false, type: String })
  @ApiQuery({ name: "damageLevel", required: false, enum: DamageLevel })
  @ApiQuery({ name: "moderationStatus", required: false, enum: ModerationStatus })
  @ApiQuery({ name: "dateFrom", required: false, type: String })
  @ApiQuery({ name: "dateTo", required: false, type: String })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiOkResponse({ type: ReportGeoJsonFeatureCollectionDto })
  @ApiBadRequestResponse({ description: "Validation error" })
  async listReports(
    @Req() req: Request & { user?: { sub?: string; role?: string } },
    @Query("crisisId") crisisId: string | undefined,
    @Query("bounds") bounds?: string,
    @Query("damageLevel") damageLevel?: DamageLevel,
    @Query("moderationStatus") moderationStatus?: ModerationStatus,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("limit") limitQuery?: string,
    @Query("cursor") cursor?: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const isAdmin = req.user?.role?.toLowerCase() === "admin";

    if (!crisisId && !bounds && !isAdmin) {
      response?.status(400);
      return {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Either crisisId or bounds is required",
        },
      };
    }

    const limit = parsePositiveInt(limitQuery, 100);
    if (!limit) {
      response?.status(400);
      return {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "limit must be a positive integer",
        },
      };
    }

    return this.reportsService.listReportsGeoJson({
      crisisId,
      bounds,
      damageLevel,
      moderationStatus,
      dateFrom,
      dateTo,
      limit,
      cursor,
    });
  }

  @Post()
  @UseGuards(ReportSubmitThrottlerGuard)
  @UseInterceptors(FileInterceptor("photo"))
  @HttpCode(201)
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: CreateReportMultipartDto })
  @ApiOperation({
    summary: "Submit a damage report",
    description:
      "Rate-limited per IP. Provide `X-Idempotency-Key` (UUID) for offline-safe replay — replayed keys return HTTP 200 with the original report instead of creating a duplicate.",
  })
  @ApiHeader({
    name: "X-Idempotency-Key",
    description:
      "Client-generated UUID. On replay returns 200 with the original report (no new row created).",
    required: false,
    schema: { type: "string", format: "uuid" },
  })
  @ApiCreatedResponse({
    description: "Report created (new submission)",
    type: SubmitReportResponseDto,
  })
  @ApiResponse({
    status: 200,
    description:
      "Idempotent replay — X-Idempotency-Key already used. Original report returned; no duplicate created.",
    type: SubmitReportResponseDto,
  })
  @ApiBadRequestResponse({ description: "Validation error" })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  async submitReport(
    @Body() payload: Record<string, unknown>,
    @UploadedFile() photo: UploadedPhoto | undefined,
    @Res({ passthrough: true }) response: Response,
    @Req() req: Request,
    @Headers("x-idempotency-key") idempotencyKey?: string,
  ) {
    const ipHash = crypto
      .createHash("sha256")
      .update(req.ip ?? "")
      .digest("hex");
    const deviceHash = crypto
      .createHash("sha256")
      .update((req.headers["user-agent"] as string) ?? "")
      .digest("hex");

    const result = await this.reportsService.submit(
      payload,
      photo,
      idempotencyKey,
      ipHash,
      deviceHash,
    );

    if (result.status !== 201) {
      response.status(result.status);
    }

    return result.body;
  }

  @Post("export")
  @SkipThrottle({ "crisis-write": true })
  @UseGuards(AuthGuard, RolesGuard, ThrottlerGuard)
  @Roles(Role.ANALYST, Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @HttpCode(202)
  @ApiBody({ type: CreateExportRequestDto })
  @ApiOperation({ summary: "Queue reports export job" })
  @ApiAcceptedResponse({
    description:
      "Export job queued — poll GET /reports/export/:jobId for status and download URL",
    type: ExportJobQueuedDto,
  })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  async createExport(
    @Body() payload: CreateExportRequestDto,
    @Req() req: Request & { user?: { role?: string } },
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!payload.format) {
      response.status(400);
      return {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "format is required",
        },
      };
    }

    const isAdmin = req.user?.role?.toLowerCase() === "admin";

    if (!payload.crisisId) {
      if (!isAdmin) {
        response.status(400);
        return {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: "crisisId is required unless admin exports all crises",
          },
        };
      }

      if (!payload.dateFrom || !payload.dateTo) {
        response.status(400);
        return {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message:
              "dateFrom and dateTo are required for all-crises export",
          },
        };
      }

      const dateFrom = new Date(payload.dateFrom);
      const dateTo = new Date(payload.dateTo);
      const isInvalidDateRange =
        Number.isNaN(dateFrom.getTime()) ||
        Number.isNaN(dateTo.getTime()) ||
        dateTo.getTime() < dateFrom.getTime();
      if (isInvalidDateRange) {
        response.status(400);
        return {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message:
              "dateFrom and dateTo must be valid ISO datetimes and dateTo must be after dateFrom",
          },
        };
      }

      const maxRangeMs =
        payload.format === "shapefile"
          ? this.maxAllCrisesShapefileRangeMs
          : this.maxAllCrisesStreamingRangeMs;

      if (dateTo.getTime() - dateFrom.getTime() > maxRangeMs) {
        response.status(400);
        return {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message:
              payload.format === "shapefile"
                ? "all-crises shapefile export date range must be 30 days or less"
                : "all-crises csv/geojson export date range must be 365 days or less",
          },
        };
      }
    }

    if (
      payload.format !== "csv" &&
      payload.format !== "geojson" &&
      payload.format !== "shapefile"
    ) {
      response.status(400);
      return {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "format must be csv, geojson, or shapefile",
        },
      };
    }

    return this.reportsService.createExportJob({
      crisisId: payload.crisisId,
      format: payload.format,
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      bounds: payload.bounds,
    });
  }

  @Get("export/:jobId")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ANALYST, Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @ApiOperation({ summary: "Get reports export job status" })
  @ApiParam({
    name: "jobId",
    type: "string",
    description: "Export job ID returned by POST /reports/export",
  })
  @ApiOkResponse({ type: ExportJobStatusDto })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiNotFoundResponse({ description: "Export job not found" })
  async getExportStatus(
    @Param("jobId") jobId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const status = await this.reportsService.getExportJobStatus(jobId);
    if (!status.found) {
      response.status(404);
      return {
        success: false,
        error: {
          code: ErrorCode.REPORT_NOT_FOUND,
          message: "Export job not found",
        },
      };
    }

    return status.body;
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single report by ID" })
  @ApiParam({ name: "id", type: "string", description: "Report UUID" })
  @ApiOkResponse({ type: ReportDetailResponseDto })
  @ApiNotFoundResponse({ description: "Report not found" })
  async getReportById(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.reportsService.getById(id);

    if (!result.found) {
      response.status(404);
      return {
        success: false,
        error: {
          code: ErrorCode.REPORT_NOT_FOUND,
          message: "Report not found",
        },
      };
    }

    return result.body;
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @HttpCode(204)
  @ApiOperation({ summary: "Soft-delete a report (admin only)" })
  @ApiParam({ name: "id", type: "string", description: "Report UUID" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiNotFoundResponse({ description: "Report not found" })
  async deleteReport(
    @Param("id") id: string,
    @Req() req: { user?: { sub?: string } },
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const actorId = req.user?.sub ?? "unknown";
    const result = await this.reportsService.softDelete(id, actorId);

    if (!result.found) {
      response.status(404);
      response.json({
        success: false,
        error: {
          code: ErrorCode.REPORT_NOT_FOUND,
          message: "Report not found",
        },
      });
      return;
    }
  }

  @Post(":id/anonymize")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @HttpCode(200)
  @ApiOperation({ summary: "Anonymize report PII fields (admin only)" })
  @ApiParam({ name: "id", type: "string", description: "Report UUID" })
  @ApiOkResponse({ type: ReportAnonymizeResponseDto })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiNotFoundResponse({ description: "Report not found" })
  async anonymizeReport(
    @Param("id") id: string,
    @Req() req: { user?: { sub?: string } },
    @Res({ passthrough: true }) response: Response,
  ) {
    const actorId = req.user?.sub ?? "unknown";
    const result = await this.reportsService.anonymize(id, actorId);

    if (!result.found) {
      response.status(404);
      return {
        success: false,
        error: {
          code: ErrorCode.REPORT_NOT_FOUND,
          message: "Report not found",
        },
      };
    }

    return result.body;
  }

  @Get(":id/history")
  @ApiOperation({ summary: "Get report history by building/location lineage" })
  @ApiParam({ name: "id", type: "string", description: "Report UUID" })
  @ApiOkResponse({ type: ReportHistoryResponseDto })
  @ApiNotFoundResponse({ description: "Report not found" })
  async getReportHistory(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const history = await this.reportsService.getReportHistory(id);

    if (!history.found) {
      response.status(404);
      return {
        success: false,
        error: {
          code: ErrorCode.REPORT_NOT_FOUND,
          message: "Report not found",
        },
      };
    }

    return history.body;
  }

  @Patch(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ANALYST, Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @ApiOperation({ summary: "Moderate a report (analyst or admin)" })
  @ApiParam({ name: "id", type: "string", description: "Report UUID" })
  @ApiBody({ type: ModerateReportDto })
  @ApiOkResponse({ type: ReportModerationResponseDto })
  @ApiBadRequestResponse({ description: "Validation error" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiNotFoundResponse({ description: "Report not found" })
  async moderateReport(
    @Param("id") id: string,
    @Body() payload: Record<string, unknown>,
    @Req() req: { user?: { sub?: string; id?: string } },
    @Res({ passthrough: true }) response: Response,
  ) {
    const validStatuses = Object.values(ModerationStatus) as string[];
    const status = payload.moderationStatus;

    if (typeof status !== "string" || !validStatuses.includes(status)) {
      response.status(400);
      return {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: `moderationStatus must be one of: ${validStatuses.join(", ")}`,
          details: { path: ["moderationStatus"] },
        },
      };
    }

    const moderatedBy = req.user?.sub ?? req.user?.id ?? "unknown";

    const result = await this.reportsService.moderate(id, {
      moderationStatus: status as ModerationStatus,
      moderationNote:
        typeof payload.moderationNote === "string"
          ? payload.moderationNote
          : undefined,
      moderatedBy,
    });

    if (!result.found) {
      response.status(404);
      return {
        success: false,
        error: {
          code: ErrorCode.REPORT_NOT_FOUND,
          message: "Report not found",
        },
      };
    }

    return result.body;
  }

  @Get(":id/audit")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ANALYST, Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @ApiOperation({ summary: "List moderation audit entries for a report" })
  @ApiParam({ name: "id", type: "string", description: "Report UUID" })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "pageSize", required: false, type: Number, example: 20 })
  @ApiOkResponse({
    description: "Paginated moderation audit entries",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: { $ref: "#/components/schemas/ModerationAuditResponseDto" },
      },
    },
  })
  @ApiBadRequestResponse({ description: "Validation error" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiNotFoundResponse({ description: "Report not found" })
  async getModerationAudit(
    @Param("id") id: string,
    @Query("page") pageQuery: string | undefined,
    @Query("pageSize") pageSizeQuery: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const page = parsePositiveInt(pageQuery, 1);
    const pageSize = parsePositiveInt(pageSizeQuery, 20);

    if (!page || !pageSize) {
      response.status(400);
      return {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "page and pageSize must be positive integers",
        },
      };
    }

    const result = await this.reportsService.getModerationAudit(id, {
      page,
      pageSize,
    });

    if (!result.found) {
      response.status(404);
      return {
        success: false,
        error: {
          code: ErrorCode.REPORT_NOT_FOUND,
          message: "Report not found",
        },
      };
    }

    return result.body;
  }
}

function parsePositiveInt(
  value: string | undefined,
  defaultValue: number,
): number | null {
  if (!value) {
    return defaultValue;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (parsed <= 0) {
    return null;
  }

  return parsed;
}
