import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { DamageLevel } from "@prisma/client";
import { AuthGuard } from "@thallesp/nestjs-better-auth";
import { AnalyticsService, SummaryPeriod } from "./analytics.service";
import { RolesGuard } from "../auth/roles.guard";
import { Roles, Role } from "../auth/roles.decorator";

class HotspotDto {
  @ApiProperty({ type: String })
  h3Index!: string;

  @ApiProperty({ type: Number })
  centerLat!: number;

  @ApiProperty({ type: Number })
  centerLng!: number;

  @ApiProperty({ type: Number, minimum: 1 })
  count!: number;

  @ApiProperty({ type: Number })
  avgDamageLevel!: number;
}

class HotspotResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: [HotspotDto] })
  data!: HotspotDto[];
}

class ReportsByDayDto {
  @ApiProperty({ type: String, example: "2026-04-16" })
  date!: string;

  @ApiProperty({ type: Number })
  count!: number;
}

class ByInfraTypeDto {
  @ApiProperty({ type: String })
  type!: string;

  @ApiProperty({ type: Number })
  count!: number;
}

class ByDamageLevelDto {
  @ApiProperty({ type: Number })
  MINIMAL!: number;

  @ApiProperty({ type: Number })
  PARTIAL!: number;

  @ApiProperty({ type: Number })
  COMPLETE!: number;
}

class RecentReportDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  submittedAt!: string;

  @ApiProperty({ type: String })
  damageLevel!: string;

  @ApiProperty({ type: String })
  infraType!: string;

  @ApiProperty({ type: String, nullable: true })
  locationText!: string | null;
}

class SummaryDataDto {
  @ApiProperty({ type: Number })
  totalReports!: number;

  @ApiProperty({ type: [ReportsByDayDto] })
  reportsByDay!: ReportsByDayDto[];

  @ApiProperty({ type: ByDamageLevelDto })
  byDamageLevel!: ByDamageLevelDto;

  @ApiProperty({ type: [ByInfraTypeDto] })
  byInfraType!: ByInfraTypeDto[];

  @ApiProperty({ type: Number })
  pendingModeration!: number;

  @ApiProperty({ type: [RecentReportDto] })
  recentReports!: RecentReportDto[];
}

class SummaryResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: SummaryDataDto })
  data!: SummaryDataDto;
}

@ApiTags("analytics")
@ApiExtraModels(HotspotDto, HotspotResponseDto, SummaryDataDto, SummaryResponseDto)
@Controller("analytics")
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get("hotspots")
  @ApiOperation({ summary: "Get report hotspots clustered with H3" })
  @ApiQuery({ name: "crisisId", type: String, required: false })
  @ApiQuery({ name: "damageLevel", enum: DamageLevel, required: false })
  @ApiOkResponse({ type: HotspotResponseDto })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  async getHotspots(
    @Query("crisisId") crisisId?: string,
    @Query("damageLevel") damageLevel?: DamageLevel,
  ) {
    return this.analyticsService.getHotspots({ crisisId, damageLevel });
  }

  @Get("summary")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.VIEWER, Role.ANALYST, Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @ApiOperation({ summary: "Get overview summary for the dashboard (single aggregation)" })
  @ApiQuery({ name: "crisisId", type: String, required: false })
  @ApiQuery({
    name: "period",
    enum: ["7d", "30d", "90d", "365d", "all"],
    required: false,
    description: "Time window. Defaults to 7d.",
  })
  @ApiQuery({
    name: "dateFrom",
    type: String,
    required: false,
    description: "Inclusive UTC start date in ISO-8601 format. Overrides period when present.",
  })
  @ApiQuery({
    name: "dateTo",
    type: String,
    required: false,
    description: "Inclusive UTC end date in ISO-8601 format. Overrides period when present.",
  })
  @ApiOkResponse({ type: SummaryResponseDto })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  async getSummary(
    @Query("crisisId") crisisId?: string,
    @Query("period") period?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    const parsedDateFrom = parseDateOrUndefined(dateFrom);
    const parsedDateTo = parseDateOrUndefined(dateTo);

    if (parsedDateFrom || parsedDateTo) {
      return this.analyticsService.getSummary({
        crisisId,
        ...(parsedDateFrom ? { dateFrom: parsedDateFrom } : {}),
        ...(parsedDateTo ? { dateTo: parsedDateTo } : {}),
      });
    }

    const VALID_PERIODS: SummaryPeriod[] = ["7d", "30d", "90d", "365d", "all"];
    const resolvedPeriod: SummaryPeriod =
      VALID_PERIODS.includes(period as SummaryPeriod)
        ? (period as SummaryPeriod)
        : "7d";

    return this.analyticsService.getSummary({ crisisId, period: resolvedPeriod });
  }
}

function parseDateOrUndefined(value?: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}
