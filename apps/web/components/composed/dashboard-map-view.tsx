"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Flag, X } from "lucide-react";

import { ReportDetailContent } from "@/components/composed/report-detail-popover";
import {
    ReportsModerationConfirmDialog,
    type ModerationConfirmStatus,
} from "@/components/composed/reports-moderation-confirm-dialog";
import { ReportSidebar } from "@/components/composed/report-sidebar";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api/client";
import { MODERATION_ACTION_LABEL_KEYS } from "@/lib/moderation-action-labels";
import type { ReportMapFeature } from "@/components/composed/leaflet-report-map";
import type { DamageLevel } from "@/lib/api/client";

// ─── dynamic map import ───────────────────────────────────────────────────────

const MapReporterView = dynamic(
    () =>
        import("@/components/composed/map-reporter-view").then((m) => ({
            default: m.MapReporterView,
        })),
    {
        ssr: false,
        loading: () => <Skeleton className="h-full w-full rounded-none" />,
    },
);

// ─── types ────────────────────────────────────────────────────────────────────

export type DashboardDamageFilter = "all" | DamageLevel;

export interface DashboardMapViewProps {
    crisisId: string | null;
    /** Controlled damage filter — passed from the parent toolbar */
    damageFilter: DashboardDamageFilter;
    dateFrom: string;
    dateTo: string;
    infraType?: string;
    moderationStatus?: string;
    /** Controlled search query — passed from the parent toolbar */
    search: string;
    /** Called when the map loads features so the parent can update KPI counts */
    onReportCount?: (count: number) => void;
}

// ─── component ────────────────────────────────────────────────────────────────

export function DashboardMapView({
    crisisId,
    damageFilter,
    dateFrom,
    dateTo,
    infraType,
    moderationStatus,
    search,
    onReportCount,
}: DashboardMapViewProps) {
    const { t, i18n } = useTranslation();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [features, setFeatures] = useState<ReportMapFeature[]>([]);
    const [isModerating, setIsModerating] = useState(false);
    const [pendingModerationStatus, setPendingModerationStatus] = useState<ModerationConfirmStatus | null>(null);
    const [areaMeta, setAreaMeta] = useState<{ total: number; truncated: boolean } | null>(null);
    const [isLive, setIsLive] = useState(false);

    const fromTimestamp = dateFrom ? Date.parse(`${dateFrom}T00:00:00Z`) : null;
    const toTimestamp = dateTo ? Date.parse(`${dateTo}T23:59:59.999Z`) : null;

    const filteredFeatures = features.filter((feature) => {
        if (damageFilter !== "all" && feature.damageLevel !== damageFilter) {
            return false;
        }

        if (infraType && feature.infraType && feature.infraType !== infraType) {
            return false;
        }

        const featureStatus = feature.moderationStatus ?? "PENDING";
        if (moderationStatus && featureStatus !== moderationStatus) {
            return false;
        }

        const submittedAt = Date.parse(feature.submittedAt);
        if (fromTimestamp !== null && !Number.isNaN(submittedAt) && submittedAt < fromTimestamp) {
            return false;
        }

        if (toTimestamp !== null && !Number.isNaN(submittedAt) && submittedAt > toTimestamp) {
            return false;
        }

        return true;
    });

    const selectedFeature = selectedId
        ? filteredFeatures.find((f) => f.id === selectedId) ?? null
        : null;

    const selectedModerationStatus = selectedFeature?.moderationStatus ?? "PENDING";

    async function moderateSelected(status: ModerationConfirmStatus) {
        if (!selectedId) return;
        setIsModerating(true);
        try {
            await apiClient.reports.moderate(selectedId, { moderationStatus: status });
            setFeatures((prev) =>
                prev.map((f) =>
                    f.id === selectedId
                        ? { ...f, moderationStatus: status }
                        : f,
                ),
            );
        } finally {
            setIsModerating(false);
        }
    }

    // Notify parent of total count whenever features change
    useEffect(() => {
        onReportCount?.(filteredFeatures.length);
    }, [filteredFeatures.length, onReportCount]);

    useEffect(() => {
        if (selectedId && !filteredFeatures.some((feature) => feature.id === selectedId)) {
            setSelectedId(null);
        }
    }, [filteredFeatures, selectedId]);

    return (
        <div className="flex h-full flex-col overflow-hidden rounded-none border-t border-border md:flex-row">
            {/* Map panel — 60% width on desktop, 60% height on mobile */}
            <div className="relative flex-[3] min-h-0 isolate overflow-hidden">
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
                <MapReporterView
                    aria-label={t("dashboard.map.aria_label")}
                    crisisId={crisisId}
                    damageFilter={damageFilter}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    selectedId={selectedId}
                    onSelectReport={setSelectedId}
                    onFeaturesLoaded={setFeatures}
                    onMetaLoaded={setAreaMeta}
                    onLiveStatusChange={setIsLive}
                    legendClassName="bottom-4 start-4"
                />
            </div>

            {/* Divider — horizontal on mobile, vertical on desktop */}
            <div className="h-px shrink-0 bg-border md:h-auto md:w-px" aria-hidden="true" />

            {/* Report feed — 40% width on desktop, 40% height on mobile */}
            <div
                className="flex-[2] min-h-0 overflow-hidden"
                role="region"
                aria-label={t("dashboard.map.feed_label")}
            >
                <ReportSidebar
                    features={filteredFeatures}
                    reportCount={filteredFeatures.length}
                    totalInArea={areaMeta?.total ?? null}
                    isTruncated={areaMeta?.truncated ?? false}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onClose={() => setSelectedId(null)}
                    externalSearch={search}
                />
            </div>

            <Sheet
                open={Boolean(selectedId)}
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedId(null);
                    }
                }}
            >
                <SheetContent
                    side={i18n.dir() === "rtl" ? "left" : "right"}
                    className="w-full overflow-y-auto p-0 sm:max-w-lg"
                >
                    <SheetHeader className="border-b border-border px-4 py-3">
                        <SheetTitle>{t("reporter.my_reports.report_detail_title")}</SheetTitle>
                        <SheetDescription>{selectedId ?? ""}</SheetDescription>
                    </SheetHeader>

                    <div className="border-b border-border bg-muted/30 px-4 py-3">
                        <p className="mb-2 text-xs font-semibold text-muted-foreground">
                            {t("dashboard.overview.table_col_actions")}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isModerating || selectedModerationStatus === "APPROVED"}
                                aria-label={t(MODERATION_ACTION_LABEL_KEYS.APPROVED)}
                                className="h-8 gap-1.5"
                                onClick={() => {
                                    setPendingModerationStatus("APPROVED");
                                }}
                            >
                                <Check aria-hidden="true" className="size-3.5" />
                                <span>{t(MODERATION_ACTION_LABEL_KEYS.APPROVED)}</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isModerating || selectedModerationStatus === "REJECTED"}
                                aria-label={t(MODERATION_ACTION_LABEL_KEYS.REJECTED)}
                                className="h-8 gap-1.5"
                                onClick={() => {
                                    setPendingModerationStatus("REJECTED");
                                }}
                            >
                                <X aria-hidden="true" className="size-3.5" />
                                <span>{t(MODERATION_ACTION_LABEL_KEYS.REJECTED)}</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isModerating}
                                aria-label={t(MODERATION_ACTION_LABEL_KEYS.FLAGGED)}
                                className="h-8 gap-1.5"
                                onClick={() => {
                                    setPendingModerationStatus("FLAGGED");
                                }}
                            >
                                <Flag aria-hidden="true" className="size-3.5" />
                                <span>{t(MODERATION_ACTION_LABEL_KEYS.FLAGGED)}</span>
                            </Button>
                        </div>
                    </div>

                    <div className="px-4 pb-4 pt-2">
                        {selectedId ? <ReportDetailContent reportId={selectedId} /> : null}
                    </div>
                </SheetContent>
            </Sheet>

            <ReportsModerationConfirmDialog
                open={Boolean(pendingModerationStatus)}
                onOpenChange={(open) => {
                    if (!open) {
                        setPendingModerationStatus(null);
                    }
                }}
                status={pendingModerationStatus}
                count={selectedId ? 1 : 0}
                onConfirm={() => {
                    if (!pendingModerationStatus) return;
                    void moderateSelected(pendingModerationStatus);
                    setPendingModerationStatus(null);
                }}
            />
        </div>
    );
}
