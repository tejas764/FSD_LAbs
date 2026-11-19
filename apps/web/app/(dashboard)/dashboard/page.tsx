"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  AlertOctagon,
  Clock,
  Activity,
  TrendingUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

import { CrisisSelector } from "@/components/composed/crisis-selector";
import { DashboardFilterSheet, type AdvancedFilters } from "@/components/composed/dashboard-filter-sheet";
import {
  DashboardDataTable,
  DashboardDataTableBody,
  DashboardDataTableCell,
  DashboardDataTableHead,
  DashboardDataTableHeader,
  DashboardDataTableRow,
} from "@/components/composed/dashboard-data-table";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { apiClient, type SummaryData, type SummaryPeriod, type SummaryQuery } from "@/lib/api/client";
import { formatDateTimeForDisplay } from "@/lib/date-format";

const SUMMARY_PERIODS = ["7d", "30d", "90d", "365d", "all"] as const satisfies SummaryPeriod[];
const DEFAULT_OVERVIEW_FILTERS: AdvancedFilters = {
  dateFrom: "",
  dateTo: "",
  infraType: "",
  moderationStatus: "",
  timePeriod: "all",
};

// ─── types ────────────────────────────────────────────────────────────────────

type HotspotEntry = {
  h3Index: string;
  centerLat: number;
  centerLng: number;
  count: number;
  avgDamageLevel: number;
};

// ─── constants ────────────────────────────────────────────────────────────────

const DAMAGE_COLORS: Record<string, string> = {
  MINIMAL: "var(--color-damage-minimal, oklch(0.75 0.15 120))",
  PARTIAL: "var(--color-damage-partial, oklch(0.7 0.18 60))",
  COMPLETE: "var(--color-damage-complete, oklch(0.55 0.22 25))",
};

const REPORTS_CHART_CONFIG = {
  count: {
    label: "Reports",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig;

const INFRA_CHART_CONFIG = {
  count: {
    label: "Reports",
    color: "var(--color-primary)",
  },
} satisfies ChartConfig;

const DAMAGE_CHART_CONFIG = {
  MINIMAL: {
    label: "Minimal",
    color: DAMAGE_COLORS.MINIMAL,
  },
  PARTIAL: {
    label: "Partial",
    color: DAMAGE_COLORS.PARTIAL,
  },
  COMPLETE: {
    label: "Complete",
    color: DAMAGE_COLORS.COMPLETE,
  },
} satisfies ChartConfig;

// ─── sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconClass?: string;
  highlight?: boolean;
}

function StatCard({ label, value, icon: Icon, iconClass = "text-primary", highlight }: StatCardProps) {
  return (
    <article
      className={cn(
        "flex items-start gap-3 rounded-lg border border-border bg-card p-4",
        highlight && "border-destructive/40 bg-destructive/5",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted",
          iconClass,
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums leading-tight text-card-foreground">{value}</p>
      </div>
    </article>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold text-foreground">{children}</h2>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <SectionHeading>{title}</SectionHeading>
      {children}
    </section>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DashboardOverviewPage() {
  const { t, i18n } = useTranslation();
  const numberFormatter = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const [crisisId, setCrisisId] = useState<string | null>(null);
  const [filters, setFilters] = useState<AdvancedFilters>(DEFAULT_OVERVIEW_FILTERS);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [hotspots, setHotspots] = useState<HotspotEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchId = useRef(0);

  const summaryQuery: SummaryQuery | null = useMemo(
    () =>
      filters.timePeriod === "custom"
        ? filters.dateFrom && filters.dateTo
          ? { crisisId, dateFrom: filters.dateFrom, dateTo: filters.dateTo }
          : null
        : {
          crisisId,
          period: SUMMARY_PERIODS.includes(filters.timePeriod as SummaryPeriod)
            ? (filters.timePeriod as SummaryPeriod)
            : "7d",
        },
    [crisisId, filters.dateFrom, filters.dateTo, filters.timePeriod],
  );

  const fetchData = useCallback(
    async (query: SummaryQuery) => {
      const myId = ++fetchId.current;
      setLoading(true);
      try {
        const summaryRes = await apiClient.analytics.summary(query);
        if (myId !== fetchId.current) return;
        if (summaryRes.success) setSummary(summaryRes.data);

        if (!query.crisisId) {
          setHotspots([]);
          return;
        }

        const hotspotsRes = await apiClient.analytics.hotspots(query.crisisId);
        if (myId !== fetchId.current) return;
        if (hotspotsRes.success) setHotspots(hotspotsRes.data.slice(0, 5));
      } finally {
        if (myId === fetchId.current) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!summaryQuery) {
      return;
    }

    void fetchData(summaryQuery);
  }, [summaryQuery, fetchData]);

  // Derived values
  const totalReports = summary?.totalReports ?? 0;
  const pendingModeration = summary?.pendingModeration ?? 0;
  const completeCount = summary?.byDamageLevel.COMPLETE ?? 0;
  const completePct = totalReports > 0 ? Math.round((completeCount / totalReports) * 100) : 0;
  const todayIsoDate = new Date().toISOString().slice(0, 10);
  const todayCount = summary?.reportsByDay.find((row) => row.date === todayIsoDate)?.count ?? 0;
  const showSkeleton = loading && !summary;

  // Chart data
  const damageChartData = summary
    ? [
      { severity: "MINIMAL", name: t("damage_minimal"), value: summary.byDamageLevel.MINIMAL, fill: DAMAGE_COLORS.MINIMAL },
      { severity: "PARTIAL", name: t("damage_partial"), value: summary.byDamageLevel.PARTIAL, fill: DAMAGE_COLORS.PARTIAL },
      { severity: "COMPLETE", name: t("damage_complete"), value: summary.byDamageLevel.COMPLETE, fill: DAMAGE_COLORS.COMPLETE },
    ]
    : [];

  const infraChartData = (summary?.byInfraType ?? []).map((row) => ({
    name: row.type,
    count: row.count,
  }));

  const timeChartData = (summary?.reportsByDay ?? []).map((row) => ({
    date: row.date,
    count: row.count,
  }));

  return (
    <div className="flex flex-col gap-6 p-6" data-density="operations">
      {/* ── page heading ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-foreground">
          {t("dashboard.overview.title")}
        </h1>
        <div data-testid="dashboard-controls" className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row sm:items-center">
          {/* Crisis selector — fixed width to stay compact alongside filters */}
          <div className="min-w-0 shrink-0 sm:w-52">
            <CrisisSelector
              selectedId={crisisId}
              onSelect={setCrisisId}
              variant="inline"
            />
          </div>
          <div className="justify-self-start sm:justify-self-end">
            <DashboardFilterSheet
              value={filters}
              onApply={setFilters}
              sections={["timePeriod"]}
              emptyValue={DEFAULT_OVERVIEW_FILTERS}
            />
          </div>
        </div>
      </div>

      {/* ── empty state ── */}
      {!crisisId && !summary && loading && (
        <p className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          {t("dashboard.overview.select_crisis_prompt")}
        </p>
      )}

      <>
        {/* ── KPI strip ── */}
        {showSkeleton ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="dashboard-skeleton-kpis" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card p-4">
                <Skeleton className="mb-2 h-3 w-20" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label={t("dashboard.overview.stat_total_reports")}
              value={numberFormatter.format(totalReports)}
              icon={FileText}
            />
            <StatCard
              label={t("dashboard.overview.stat_today")}
              value={`+${numberFormatter.format(todayCount)}`}
              icon={TrendingUp}
            />
            <StatCard
              label={t("dashboard.overview.stat_pending_moderation")}
              value={numberFormatter.format(pendingModeration)}
              icon={Clock}
              iconClass={pendingModeration > 0 ? "text-warning" : "text-primary"}
              highlight={pendingModeration > 0}
            />
            <StatCard
              label={t("dashboard.overview.stat_complete_pct")}
              value={`${completePct}%`}
              icon={AlertOctagon}
              iconClass={completePct > 30 ? "text-destructive" : "text-primary"}
            />
          </div>
        )}

        {/* ── area chart ── */}
        {showSkeleton ? (
          <ChartCard title={t("dashboard.overview.chart_reports_over_time")}>
            <div className="h-40" data-testid="dashboard-skeleton-charts" aria-hidden="true">
              <Skeleton className="h-full w-full" />
            </div>
          </ChartCard>
        ) : (
          <ChartCard title={t("dashboard.overview.chart_reports_over_time")}>
            <ChartContainer config={REPORTS_CHART_CONFIG} className="h-40 w-full">
              <AreaChart data={timeChartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-reports" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-primary)"
                  fill="url(#grad-reports)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </ChartCard>
        )}

        {/* ── two-column charts ── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* damage donut */}
          <ChartCard title={t("dashboard.overview.chart_damage_breakdown")}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="h-36 w-36 shrink-0">
                <ChartContainer config={DAMAGE_CHART_CONFIG} className="size-full">
                  <PieChart>
                    <Pie
                      data={damageChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius="55%"
                      outerRadius="80%"
                      dataKey="value"
                      nameKey="severity"
                      aria-label={t("dashboard.overview.chart_damage_breakdown")}
                    >
                      {damageChartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent nameKey="severity" labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""} />} />
                    <ChartLegend content={<ChartLegendContent nameKey="severity" className="sr-only" />} />
                  </PieChart>
                </ChartContainer>
              </div>
              <ul className="flex flex-col gap-1.5 text-xs" role="list">
                {damageChartData.map((entry) => (
                  <li key={entry.name} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ background: entry.fill }}
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="ms-auto tabular-nums font-medium">{numberFormatter.format(entry.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </ChartCard>

          {/* infra type bar chart */}
          <ChartCard title={t("dashboard.overview.chart_infra_breakdown")}>
            <ChartContainer config={INFRA_CHART_CONFIG} className="h-36 w-full">
              <BarChart
                data={infraChartData}
                layout="vertical"
                margin={{ top: 0, right: 4, left: 4, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-primary)" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ChartContainer>
          </ChartCard>
        </div>

        {/* ── hotspot list ── */}
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              {t("dashboard.overview.hotspots_title")}
            </h2>
            <Activity aria-hidden="true" className="size-4 text-muted-foreground" />
          </div>
          {showSkeleton && (
            <div className="space-y-2 px-4 py-3" data-testid="dashboard-skeleton-hotspots" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, idx) => (
                <Skeleton key={idx} className="h-6 w-full" />
              ))}
            </div>
          )}
          {hotspots.length === 0 && !loading && !showSkeleton && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">—</p>
          )}
          {!showSkeleton && hotspots.length > 0 && (
            <DashboardDataTable>
              <DashboardDataTableHeader>
                <DashboardDataTableRow className="border-b border-border">
                  <DashboardDataTableHead className="w-10">#</DashboardDataTableHead>
                  <DashboardDataTableHead>{t("dashboard.overview.table_col_location")}</DashboardDataTableHead>
                  <DashboardDataTableHead className="text-end">{t("dashboard.overview.stat_total_reports")}</DashboardDataTableHead>
                  <DashboardDataTableHead className="text-end">{t("dashboard.overview.table_col_damage")}</DashboardDataTableHead>
                </DashboardDataTableRow>
              </DashboardDataTableHeader>
              <DashboardDataTableBody>
                {hotspots.map((spot, idx) => {
                  const avgWeight = spot.avgDamageLevel;
                  const severity: "default" | "secondary" | "destructive" =
                    avgWeight >= 2.5 ? "destructive" : avgWeight >= 1.5 ? "secondary" : "default";
                  return (
                    <DashboardDataTableRow key={spot.h3Index}>
                      <DashboardDataTableCell className="tabular-nums">{idx + 1}</DashboardDataTableCell>
                      <DashboardDataTableCell>
                        {spot.centerLat.toFixed(3)}, {spot.centerLng.toFixed(3)}
                      </DashboardDataTableCell>
                      <DashboardDataTableCell className="text-end tabular-nums font-medium">{numberFormatter.format(spot.count)}</DashboardDataTableCell>
                      <DashboardDataTableCell className="text-end">
                        <Badge variant={severity} className="shrink-0 text-[10px]">
                          {avgWeight >= 2.5
                            ? t("damage_complete")
                            : avgWeight >= 1.5
                              ? t("damage_partial")
                              : t("damage_minimal")}
                        </Badge>
                      </DashboardDataTableCell>
                    </DashboardDataTableRow>
                  );
                })}
              </DashboardDataTableBody>
            </DashboardDataTable>
          )}
        </section>

        {/* ── recent reports ── */}
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              {t("dashboard.overview.recent_title")}
            </h2>
            <Link
              href="/dashboard/reports"
              className="text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("dashboard.overview.recent_view_all")}
            </Link>
          </div>
          <DashboardDataTable>
            <DashboardDataTableHeader>
              <DashboardDataTableRow className="border-b border-border">
                <DashboardDataTableHead>{t("dashboard.overview.table_col_date")}</DashboardDataTableHead>
                <DashboardDataTableHead>{t("dashboard.overview.table_col_damage")}</DashboardDataTableHead>
                <DashboardDataTableHead>{t("dashboard.overview.table_col_infra")}</DashboardDataTableHead>
                <DashboardDataTableHead>{t("dashboard.overview.table_col_location")}</DashboardDataTableHead>
              </DashboardDataTableRow>
            </DashboardDataTableHeader>
            <DashboardDataTableBody>
              {showSkeleton && (
                <DashboardDataTableRow data-testid="dashboard-skeleton-recent" aria-hidden="true">
                  <DashboardDataTableCell colSpan={4}>
                    <Skeleton className="h-6 w-full" />
                  </DashboardDataTableCell>
                </DashboardDataTableRow>
              )}
              {!showSkeleton && (summary?.recentReports ?? []).length === 0 && (
                <DashboardDataTableRow>
                  <DashboardDataTableCell colSpan={4} className="py-6 text-center">
                    —
                  </DashboardDataTableCell>
                </DashboardDataTableRow>
              )}
              {(summary?.recentReports ?? []).map((r) => (
                <DashboardDataTableRow key={r.id}>
                  <DashboardDataTableCell className="tabular-nums">
                    {r.submittedAt ? formatDateTimeForDisplay(r.submittedAt, i18n?.language) : "—"}
                  </DashboardDataTableCell>
                  <DashboardDataTableCell>
                    <Badge
                      variant={
                        r.damageLevel === "COMPLETE"
                          ? "destructive"
                          : r.damageLevel === "PARTIAL"
                            ? "secondary"
                            : "default"
                      }
                      className="text-[10px]"
                    >
                      {t(`damage_${r.damageLevel.toLowerCase() as "minimal" | "partial" | "complete"}`)}
                    </Badge>
                  </DashboardDataTableCell>
                  <DashboardDataTableCell>{r.infraType}</DashboardDataTableCell>
                  <DashboardDataTableCell className="max-w-[140px] truncate">
                    {r.locationText ?? "—"}
                  </DashboardDataTableCell>
                </DashboardDataTableRow>
              ))}
            </DashboardDataTableBody>
          </DashboardDataTable>
        </section>
      </>
    </div>
  );
}
