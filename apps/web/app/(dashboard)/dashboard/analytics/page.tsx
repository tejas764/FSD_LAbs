"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, AlertOctagon, BarChart3, FileText, MapPin, TrendingUp } from "lucide-react";
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart,
    XAxis,
    YAxis,
} from "recharts";

import { CrisisSelector } from "@/components/composed/crisis-selector";
import {
    DashboardDataTable,
    DashboardDataTableBody,
    DashboardDataTableCell,
    DashboardDataTableHead,
    DashboardDataTableHeader,
    DashboardDataTableRow,
} from "@/components/composed/dashboard-data-table";
import { TablePaginationControls } from "@/components/composed/table-pagination-controls";
import { Badge } from "@/components/ui/badge";
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@/components/ui/chart";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiClient, type DamageLevel, type SummaryData } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const AnalyticsHotspotMap = dynamic(
    () => import("@/components/composed/analytics-hotspot-map").then((module) => ({
        default: module.AnalyticsHotspotMap,
    })),
    {
        ssr: false,
        loading: () => <Skeleton className="h-[320px] w-full" />,
    },
);

interface Hotspot {
    h3Index: string;
    centerLat: number;
    centerLng: number;
    count: number;
    avgDamageLevel: number;
}

type AnalyticsDamageFilter = "all" | DamageLevel;

const DAMAGE_COLORS: Record<DamageLevel, string> = {
    MINIMAL: "var(--color-damage-minimal, oklch(0.75 0.15 120))",
    PARTIAL: "var(--color-damage-partial, oklch(0.7 0.18 60))",
    COMPLETE: "var(--color-damage-complete, oklch(0.55 0.22 25))",
};

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

const INFRA_CHART_CONFIG = {
    count: {
        label: "Reports",
        color: "var(--color-primary)",
    },
} satisfies ChartConfig;

function getAverageDamage(summary: SummaryData | null): number {
    if (!summary || summary.totalReports === 0) return 0;
    const weightedTotal =
        summary.byDamageLevel.MINIMAL * 1 +
        summary.byDamageLevel.PARTIAL * 2 +
        summary.byDamageLevel.COMPLETE * 3;
    return weightedTotal / summary.totalReports;
}

function getDamageBadge(avg: number): { label: DamageLevel; variant: "default" | "secondary" | "destructive" } {
    if (avg >= 2.5) return { label: "COMPLETE", variant: "destructive" };
    if (avg >= 1.5) return { label: "PARTIAL", variant: "secondary" };
    return { label: "MINIMAL", variant: "default" };
}

function SectionCard({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
    return (
        <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
            <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2>
            {children}
        </section>
    );
}

function StatTile({
    label,
    value,
    icon: Icon,
    hint,
    highlight,
    iconClassName,
}: {
    label: string;
    value: string;
    icon: React.ElementType;
    hint?: string;
    highlight?: boolean;
    iconClassName?: string;
}) {
    return (
        <article className={cn("flex items-start gap-3 rounded-lg border border-border bg-card p-4", highlight && "border-destructive/40 bg-destructive/5")}>
            <span aria-hidden="true" className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-primary", iconClassName)}>
                <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold tabular-nums leading-tight text-card-foreground">{value}</p>
                {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
            </div>
        </article>
    );
}

function DetailRow({ label, value, valueClassName }: { label: string; value: React.ReactNode; valueClassName?: string }) {
    return (
        <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className={cn("ms-auto text-end font-medium text-foreground", valueClassName)}>{value}</span>
        </div>
    );
}

export default function AnalyticsPage() {
    const { t } = useTranslation();
    const [crisisId, setCrisisId] = useState<string | null>(null);
    const [damageFilter, setDamageFilter] = useState<AnalyticsDamageFilter>("all");
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [hotspots, setHotspots] = useState<Hotspot[]>([]);
    const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
    const [hotspotPageIdx, setHotspotPageIdx] = useState(0);
    const [hotspotPageSize, setHotspotPageSize] = useState(20);
    const [loading, setLoading] = useState(false);
    const [isLive, setIsLive] = useState(false);
    const fetchIdRef = useRef(0);

    const fetchAnalytics = useCallback(async (nextCrisisId: string | null, nextDamageFilter: AnalyticsDamageFilter) => {
        const fetchId = ++fetchIdRef.current;
        setLoading(true);

        try {
            const summaryRes = await apiClient.analytics.summary(nextCrisisId, "all");

            if (fetchId !== fetchIdRef.current) return;

            setSummary(summaryRes.success ? summaryRes.data : null);

            // Only fetch hotspots if a crisis is selected
            if (!nextCrisisId) {
                setHotspots([]);
                return;
            }

            const hotspotsRes = await apiClient.analytics.hotspots(
                nextCrisisId,
                nextDamageFilter === "all" ? undefined : nextDamageFilter,
            );

            if (fetchId !== fetchIdRef.current) return;

            setHotspots(hotspotsRes.success ? hotspotsRes.data : []);
        } catch {
            if (fetchId !== fetchIdRef.current) return;
            setSummary(null);
            setHotspots([]);
        } finally {
            if (fetchId === fetchIdRef.current) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void fetchAnalytics(crisisId, damageFilter);
    }, [crisisId, damageFilter, fetchAnalytics]);

    useEffect(() => {
        if (!crisisId) {
            setIsLive(false);
            return;
        }

        const stream = apiClient.reports.stream(crisisId);

        const handleRealtimeUpdate = () => {
            void fetchAnalytics(crisisId, damageFilter);
        };
        const handleReady = () => {
            setIsLive(true);
        };
        const handleError = () => {
            setIsLive(false);
        };

        stream.addEventListener("report.updated", handleRealtimeUpdate);
        stream.addEventListener("export.complete", handleRealtimeUpdate);
        stream.addEventListener("ready", handleReady);
        stream.addEventListener("error", handleError);

        return () => {
            stream.removeEventListener("report.updated", handleRealtimeUpdate);
            stream.removeEventListener("export.complete", handleRealtimeUpdate);
            stream.removeEventListener("ready", handleReady);
            stream.removeEventListener("error", handleError);
            stream.close();
            setIsLive(false);
        };
    }, [crisisId, damageFilter, fetchAnalytics]);

    useEffect(() => {
        if (hotspots.length === 0) {
            setSelectedHotspotId(null);
            return;
        }

        setSelectedHotspotId((current) =>
            current && hotspots.some((spot) => spot.h3Index === current) ? current : hotspots[0]?.h3Index ?? null,
        );
    }, [hotspots]);

    useEffect(() => {
        setHotspotPageIdx(0);
    }, [hotspots, hotspotPageSize, crisisId, damageFilter]);

    const selectedHotspot = useMemo(
        () => hotspots.find((spot) => spot.h3Index === selectedHotspotId) ?? null,
        [hotspots, selectedHotspotId],
    );

    const hotspotTotalPages = Math.max(1, Math.ceil(hotspots.length / hotspotPageSize));
    const pagedHotspots = useMemo(() => {
        const start = hotspotPageIdx * hotspotPageSize;
        return hotspots.slice(start, start + hotspotPageSize);
    }, [hotspots, hotspotPageIdx, hotspotPageSize]);

    const averageDamage = getAverageDamage(summary);
    const averageDamageBadge = getDamageBadge(selectedHotspot?.avgDamageLevel ?? averageDamage);
    const topInfraType = summary?.byInfraType[0]?.type ?? "—";
    const hotspotReportCount = hotspots.reduce((acc, spot) => acc + spot.count, 0);
    const hotspotCoverage = summary?.totalReports
        ? `${Math.min(100, Math.round((hotspotReportCount / Math.max(summary.totalReports, 1)) * 10000) / 100)}%`
        : "0%";
    const selectedHotspotShare = summary?.totalReports && selectedHotspot
        ? `${Math.round((selectedHotspot.count / Math.max(summary.totalReports, 1)) * 1000) / 10}%`
        : "0%";

    const damageChartData = summary
        ? [
            { severity: "MINIMAL", label: t("damage_minimal"), value: summary.byDamageLevel.MINIMAL, fill: DAMAGE_COLORS.MINIMAL },
            { severity: "PARTIAL", label: t("damage_partial"), value: summary.byDamageLevel.PARTIAL, fill: DAMAGE_COLORS.PARTIAL },
            { severity: "COMPLETE", label: t("damage_complete"), value: summary.byDamageLevel.COMPLETE, fill: DAMAGE_COLORS.COMPLETE },
        ]
        : [];

    const infraChartData = (summary?.byInfraType ?? []).slice(0, 5).map((row) => ({
        name: row.type,
        count: row.count,
    }));

    const isInitialLoading = loading && !summary;
    const totalReports = summary?.totalReports ?? 0;
    const pendingModeration = summary?.pendingModeration ?? 0;
    const activeDamageLabel = damageFilter === "all"
        ? t("dashboard.map.filter_all")
        : t(`damage_${damageFilter.toLowerCase()}` as const);

    const selectedHotspotDetail = selectedHotspot ? (
        <div className="flex flex-col gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin aria-hidden="true" className="size-4" />
                <span className="truncate font-mono text-xs">{selectedHotspot.h3Index}</span>
            </div>
            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-4">
                <DetailRow label={t("dashboard.analytics.detail_reports")} value={selectedHotspot.count.toLocaleString()} />
                <DetailRow
                    label={t("dashboard.analytics.detail_coordinates")}
                    value={`${selectedHotspot.centerLat.toFixed(4)}, ${selectedHotspot.centerLng.toFixed(4)}`}
                    valueClassName="font-mono tabular-nums text-xs"
                />
                <DetailRow
                    label={t("dashboard.analytics.detail_avg_damage")}
                    value={
                        <Badge variant={averageDamageBadge.variant}>
                            {t(`damage_${averageDamageBadge.label.toLowerCase()}` as const)}
                        </Badge>
                    }
                />
                <DetailRow label={t("dashboard.analytics.detail_share")} value={selectedHotspotShare} valueClassName="tabular-nums" />
            </div>
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    <Activity aria-hidden="true" className="size-4" />
                    <span>{t("dashboard.analytics.filter_label")}</span>
                    <span className="ms-auto font-medium text-foreground">{activeDamageLabel}</span>
                </div>
            </div>
        </div>
    ) : (
        <p className="text-sm text-muted-foreground">{t("dashboard.analytics.no_data")}</p>
    );

    const hotspotsTable = hotspots.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("dashboard.analytics.no_data")}</p>
    ) : (
        <>
            <DashboardDataTable>
                <DashboardDataTableHeader>
                    <DashboardDataTableRow className="border-b border-border">
                        <DashboardDataTableHead>{t("dashboard.overview.hotspots_area")}</DashboardDataTableHead>
                        <DashboardDataTableHead className="text-end">{t("dashboard.overview.hotspots_reports")}</DashboardDataTableHead>
                        <DashboardDataTableHead className="text-end">{t("dashboard.overview.hotspots_severity")}</DashboardDataTableHead>
                    </DashboardDataTableRow>
                </DashboardDataTableHeader>
                <DashboardDataTableBody>
                    {pagedHotspots.map((spot) => {
                        const badge = getDamageBadge(spot.avgDamageLevel);
                        return (
                            <DashboardDataTableRow
                                key={spot.h3Index}
                                data-state={spot.h3Index === selectedHotspotId ? "selected" : undefined}
                                className="cursor-pointer"
                                onClick={() => setSelectedHotspotId(spot.h3Index)}
                            >
                                <DashboardDataTableCell>
                                    <button
                                        type="button"
                                        className="text-start text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        onClick={() => setSelectedHotspotId(spot.h3Index)}
                                        aria-label={`${spot.h3Index} ${spot.centerLat.toFixed(3)} ${spot.centerLng.toFixed(3)}`}
                                    >
                                        {spot.h3Index}
                                    </button>
                                </DashboardDataTableCell>
                                <DashboardDataTableCell className="text-end tabular-nums font-medium">{spot.count.toLocaleString()}</DashboardDataTableCell>
                                <DashboardDataTableCell className="text-end">
                                    <Badge variant={badge.variant}>{t(`damage_${badge.label.toLowerCase()}` as const)}</Badge>
                                </DashboardDataTableCell>
                            </DashboardDataTableRow>
                        );
                    })}
                </DashboardDataTableBody>
            </DashboardDataTable>
            {hotspots.length > 0 ? (
                <TablePaginationControls
                    page={hotspotPageIdx + 1}
                    total={hotspotTotalPages}
                    canGoPrev={hotspotPageIdx > 0}
                    canGoNext={hotspotPageIdx < hotspotTotalPages - 1}
                    onPrev={() => setHotspotPageIdx((prev) => Math.max(0, prev - 1))}
                    onNext={() => setHotspotPageIdx((prev) => Math.min(hotspotTotalPages - 1, prev + 1))}
                    pageSize={hotspotPageSize}
                    onPageSizeChange={(nextPageSize) => { setHotspotPageSize(nextPageSize); setHotspotPageIdx(0); }}
                    className="mt-3 px-0"
                />
            ) : null}
        </>
    );

    return (
        <div className="flex flex-col gap-6 p-6" data-density="operations">
            {/* ── page heading ── */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-lg font-semibold text-foreground">{t("dashboard.analytics.title")}</h1>
                <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-[220px_180px]">
                    <CrisisSelector selectedId={crisisId} onSelect={setCrisisId} variant="inline" />
                    <Select value={damageFilter} onValueChange={(value) => setDamageFilter(value as AnalyticsDamageFilter)}>
                        <SelectTrigger aria-label={t("dashboard.map.filter_damage_label")} className="h-8 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t("dashboard.map.filter_all")}</SelectItem>
                            <SelectItem value="MINIMAL">{t("damage_minimal")}</SelectItem>
                            <SelectItem value="PARTIAL">{t("damage_partial")}</SelectItem>
                            <SelectItem value="COMPLETE">{t("damage_complete")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* ── 2-tab: map | trends ── */}
            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">{t("dashboard.analytics.map_title")}</TabsTrigger>
                    <TabsTrigger value="trends">{t("dashboard.analytics.trend_title")}</TabsTrigger>
                </TabsList>

                {/* ── Overview tab: map only ── */}
                <TabsContent value="overview" className="mt-0">
                    <section
                        data-testid="analytics-map-panel"
                        aria-label={t("dashboard.analytics.map_title")}
                        className="relative overflow-hidden rounded-lg bg-card"
                    >
                        {isLive ? (
                            <div
                                role="status"
                                aria-live="polite"
                                className="absolute start-2 top-2 z-[450] flex items-center gap-1.5 rounded-full bg-success px-2 py-0.5 text-xs font-medium text-success-foreground"
                            >
                                <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
                                {t("dashboard.map.live_badge")}
                            </div>
                        ) : null}
                        {isInitialLoading ? (
                            <Skeleton className="h-[380px] w-full" />
                        ) : !crisisId ? (
                            <div className="flex h-[380px] flex-col items-center justify-center gap-3 text-muted-foreground">
                                <MapPin className="size-10 opacity-30" aria-hidden="true" />
                                <p className="text-sm">{t("dashboard.analytics.no_data")}</p>
                            </div>
                        ) : (
                            <AnalyticsHotspotMap
                                hotspots={hotspots}
                                selectedHotspotId={selectedHotspotId}
                                onSelectHotspot={setSelectedHotspotId}
                                ariaLabel={t("dashboard.analytics.map_region_label")}
                                className="h-[380px] rounded-none border-0"
                            />
                        )}
                    </section>
                </TabsContent>

                {/* ── Trends tab: per-crisis damage + infra breakdown ── */}
                <TabsContent value="trends" className="mt-0 space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                        <SectionCard title={t("dashboard.overview.chart_damage_breakdown")}>
                            {isInitialLoading ? <Skeleton className="h-40 w-full" /> : (
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                                    <div className="h-40 w-40 shrink-0">
                                        <ChartContainer config={DAMAGE_CHART_CONFIG} className="size-full">
                                            <PieChart>
                                                <Pie data={damageChartData} dataKey="value" nameKey="severity" innerRadius="55%" outerRadius="80%">
                                                    {damageChartData.map((entry) => <Cell key={entry.severity} fill={entry.fill} />)}
                                                </Pie>
                                                <ChartTooltip content={<ChartTooltipContent nameKey="severity" />} />
                                            </PieChart>
                                        </ChartContainer>
                                    </div>
                                    <ul className="flex flex-1 flex-col gap-2 text-xs">
                                        {damageChartData.map((entry) => (
                                            <li key={entry.severity} className="flex items-center gap-2">
                                                <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: entry.fill }} />
                                                <span className="text-muted-foreground">{entry.label}</span>
                                                <span className="ms-auto tabular-nums font-medium">{entry.value.toLocaleString()}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard title={t("dashboard.overview.chart_infra_breakdown")}>
                            {isInitialLoading ? <Skeleton className="h-40 w-full" /> : (
                                <ChartContainer config={INFRA_CHART_CONFIG} className="h-40 w-full">
                                    <BarChart data={infraChartData} layout="vertical" margin={{ top: 0, right: 4, left: 4, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                                        <XAxis type="number" tick={{ fontSize: 10 }} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={84} />
                                        <ChartTooltip content={<ChartTooltipContent />} />
                                        <Bar dataKey="count" fill="var(--color-primary)" radius={[0, 3, 3, 0]} />
                                    </BarChart>
                                </ChartContainer>
                            )}
                        </SectionCard>
                    </div>
                </TabsContent>
            </Tabs>

            {/* ── always visible: metrics ── */}
            <SectionCard title={t("dashboard.analytics.stats_title")}>
                {isInitialLoading ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <Skeleton key={index} className="h-20 w-full" />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <StatTile label={t("dashboard.overview.stat_total_reports")} value={totalReports.toLocaleString()} icon={FileText} />
                        <StatTile
                            label={t("dashboard.analytics.stat_avg_damage")}
                            value={averageDamage.toFixed(2)}
                            icon={Activity}
                            hint={t(`damage_${averageDamageBadge.label.toLowerCase()}` as const)}
                            iconClassName={averageDamageBadge.variant === "destructive" ? "text-destructive" : "text-primary"}
                        />
                        <StatTile label={t("dashboard.analytics.stat_hotspot_count")} value={hotspots.length.toLocaleString()} icon={MapPin} />
                        <StatTile label={t("dashboard.analytics.stat_top_infra")} value={topInfraType} icon={BarChart3} />
                        <StatTile label={t("dashboard.analytics.stat_coverage")} value={hotspotCoverage} icon={TrendingUp} />
                        <StatTile
                            label={t("dashboard.overview.stat_pending_moderation")}
                            value={pendingModeration.toLocaleString()}
                            icon={AlertOctagon}
                            highlight={pendingModeration > 0}
                            iconClassName={pendingModeration > 0 ? "text-destructive" : "text-primary"}
                        />
                    </div>
                )}
            </SectionCard>

            {/* ── always visible: hotspot table + detail panel ── */}
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.85fr)]">
                <SectionCard title={t("dashboard.analytics.hotspots_title")}>
                    <p className="mb-3 text-xs text-muted-foreground">{t("dashboard.analytics.hotspots_click_hint")}</p>
                    {loading && hotspots.length === 0 ? <Skeleton className="h-40 w-full" /> : hotspotsTable}
                </SectionCard>
                <SectionCard title={t("dashboard.analytics.detail_title")}>{selectedHotspotDetail}</SectionCard>
            </div>
        </div>
    );
}
