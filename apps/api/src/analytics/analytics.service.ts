import { Inject, Injectable } from "@nestjs/common";
import { DamageLevel, ModerationStatus, Prisma } from "@prisma/client";
import { cellToLatLng, latLngToCell } from "h3-js";
import { PrismaService } from "../prisma/prisma.service";

type HotspotsQuery = {
  crisisId?: string;
  damageLevel?: DamageLevel;
};

type Hotspot = {
  h3Index: string;
  centerLat: number;
  centerLng: number;
  count: number;
  avgDamageLevel: number;
};

export type SummaryPeriod = "7d" | "30d" | "90d" | "365d" | "all";

type SummaryQuery = {
  crisisId?: string;
  period?: SummaryPeriod;
  dateFrom?: Date;
  dateTo?: Date;
};

type RecentReport = {
  id: string;
  submittedAt: string;
  damageLevel: DamageLevel;
  infraType: string;
  locationText: string | null;
};

type SummaryData = {
  totalReports: number;
  reportsByDay: Array<{ date: string; count: number }>;
  byDamageLevel: Record<DamageLevel, number>;
  byInfraType: Array<{ type: string; count: number }>;
  pendingModeration: number;
  recentReports: RecentReport[];
};

const H3_RESOLUTION = 7;

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getHotspots(
    query: HotspotsQuery,
  ): Promise<{ success: true; data: Hotspot[] }> {
    const buckets = new Map<
      string,
      {
        count: number;
        damageSum: number;
      }
    >();

    const BATCH_SIZE = 1000;
    let cursor: string | undefined;

    while (true) {
      const batch = await this.prisma.report.findMany({
        where: {
          ...(query.crisisId ? { crisisId: query.crisisId } : {}),
          damageLevel: query.damageLevel,
          isDuplicate: false,
          supersededById: null,
          latitude: { not: null },
          longitude: { not: null },
        },
        orderBy: { id: "asc" },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          latitude: true,
          longitude: true,
          damageLevel: true,
        },
      });

      for (const report of batch) {
        if (report.latitude === null || report.longitude === null) {
          continue;
        }

        const h3Index = latLngToCell(
          report.latitude,
          report.longitude,
          H3_RESOLUTION,
        );
        const bucket = buckets.get(h3Index) ?? { count: 0, damageSum: 0 };
        bucket.count += 1;
        bucket.damageSum += toDamageWeight(report.damageLevel);
        buckets.set(h3Index, bucket);
      }

      if (batch.length < BATCH_SIZE) break;
      cursor = batch[batch.length - 1].id;
    }

    const data: Hotspot[] = [...buckets.entries()]
      .map(([h3Index, value]) => {
        const [centerLat, centerLng] = cellToLatLng(h3Index);
        return {
          h3Index,
          centerLat,
          centerLng,
          count: value.count,
          avgDamageLevel: value.damageSum / value.count,
        };
      })
      .sort((left, right) => right.count - left.count);

    return {
      success: true,
      data,
    };
  }

  async getSummary(
    query: SummaryQuery,
  ): Promise<{ success: true; data: SummaryData }> {
    // Determine date filter: custom range takes precedence over period
    let dateFilter: { gte?: Date; lte?: Date } | undefined;
    let dateFromForQuery: Date | undefined;
    
    if (query.dateFrom || query.dateTo) {
      dateFilter = {};
      if (query.dateFrom) {
        dateFilter.gte = query.dateFrom;
        dateFromForQuery = query.dateFrom;
      }
      if (query.dateTo) dateFilter.lte = query.dateTo;
    } else {
      dateFromForQuery = query.period ? periodToDate(query.period) : undefined;
      dateFilter = dateFromForQuery ? { gte: dateFromForQuery } : undefined;
    }

    const baseWhere = {
      ...(query.crisisId ? { crisisId: query.crisisId } : {}),
      isDuplicate: false,
      supersededById: null,
      deletedAt: null,
      ...(dateFilter ? { submittedAt: dateFilter } : {}),
    };

    const [totalReports, pendingModeration, damageGroups, infraGroups, rawDays, recentRows] =
      await Promise.all([
        this.prisma.report.count({ where: baseWhere }),
        this.prisma.report.count({
          where: {
            ...baseWhere,
            moderationStatus: ModerationStatus.PENDING,
          },
        }),
        this.prisma.report.groupBy({
          by: ["damageLevel"],
          where: baseWhere,
          _count: { damageLevel: true },
        }),
        this.prisma.report.groupBy({
          by: ["infraType"],
          where: baseWhere,
          _count: { infraType: true },
          orderBy: { _count: { infraType: "desc" } },
          take: 8,
        }),
        this.prisma.$queryRaw<Array<{ date: string; count: bigint }>>(
          buildDayQuery(query.crisisId ?? null, dateFromForQuery, query.dateTo),
        ),
        this.prisma.report.findMany({
          where: baseWhere,
          orderBy: { submittedAt: "desc" },
          take: 5,
          select: {
            id: true,
            submittedAt: true,
            damageLevel: true,
            infraType: true,
            locationText: true,
          },
        }),
      ]);

    const byDamageLevel: Record<DamageLevel, number> = {
      MINIMAL: 0,
      PARTIAL: 0,
      COMPLETE: 0,
    };
    for (const row of damageGroups) {
      byDamageLevel[row.damageLevel] = row._count.damageLevel;
    }

    const byInfraType = infraGroups.map((row) => ({
      type: row.infraType as string,
      count: row._count.infraType,
    }));

    const reportsByDay = rawDays.map((row) => ({
      date: row.date,
      count: Number(row.count),
    }));

    const recentReports: RecentReport[] = recentRows.map((r) => ({
      id: r.id,
      submittedAt: r.submittedAt.toISOString(),
      damageLevel: r.damageLevel,
      infraType: r.infraType as string,
      locationText: r.locationText,
    }));

    return {
      success: true,
      data: {
        totalReports,
        reportsByDay,
        byDamageLevel,
        byInfraType,
        pendingModeration,
        recentReports,
      },
    };
  }
}

function toDamageWeight(level: DamageLevel): number {
  if (level === "COMPLETE") {
    return 3;
  }
  if (level === "PARTIAL") {
    return 2;
  }
  return 1;
}

function periodToDate(period: SummaryPeriod): Date | undefined {
  if (period === "all") return undefined;
  const days = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 }[period];
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function buildDayQuery(crisisId: string | null, dateFrom: Date | undefined, dateTo?: Date): Prisma.Sql {
  if (crisisId && dateFrom && dateTo) {
    return Prisma.sql`
      SELECT
        to_char("submittedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        COUNT(*)::bigint AS count
      FROM "Report"
      WHERE
        "crisisId" = ${crisisId}
        AND "isDuplicate" = false
        AND "supersededById" IS NULL
        AND "submittedAt" >= ${dateFrom}
        AND "submittedAt" <= ${dateTo}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }
  if (crisisId && dateFrom) {
    return Prisma.sql`
      SELECT
        to_char("submittedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        COUNT(*)::bigint AS count
      FROM "Report"
      WHERE
        "crisisId" = ${crisisId}
        AND "isDuplicate" = false
        AND "supersededById" IS NULL
        AND "submittedAt" >= ${dateFrom}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }
  if (crisisId) {
    return Prisma.sql`
      SELECT
        to_char("submittedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        COUNT(*)::bigint AS count
      FROM "Report"
      WHERE
        "crisisId" = ${crisisId}
        AND "isDuplicate" = false
        AND "supersededById" IS NULL
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }
  if (dateFrom) {
    return Prisma.sql`
      SELECT
        to_char("submittedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        COUNT(*)::bigint AS count
      FROM "Report"
      WHERE
        "isDuplicate" = false
        AND "supersededById" IS NULL
        AND "submittedAt" >= ${dateFrom}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }
  return Prisma.sql`
    SELECT
      to_char("submittedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
      COUNT(*)::bigint AS count
    FROM "Report"
    WHERE
      "isDuplicate" = false
      AND "supersededById" IS NULL
    GROUP BY 1
    ORDER BY 1 ASC
  `;
}
