"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, Check, Eye, Flag, MessageCircleQuestion, MoreVertical, X } from "lucide-react";

import { useSession } from "@/lib/auth-client";
import { apiClient, type DamageLevel, type ReportGeoJsonFeatureCollection } from "@/lib/api/client";
import { CrisisSelector } from "@/components/composed/crisis-selector";
import { ReportDetailContent } from "@/components/composed/report-detail-popover";
import { TablePaginationControls } from "@/components/composed/table-pagination-controls";
import {
    ReportsModerationConfirmDialog,
    type ModerationConfirmStatus,
} from "@/components/composed/reports-moderation-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODERATION_ACTION_LABEL_KEYS } from "@/lib/moderation-action-labels";
import { runOptimisticToastMutation } from "@/lib/optimistic-toast";
import { formatDateTimeForDisplay } from "@/lib/date-format";

function damageBadgeClass(level: DamageLevel): string {
    return {
        MINIMAL:
            "bg-[color:var(--damage-minimal)]/15 text-[color:var(--damage-minimal)] border-[color:var(--damage-minimal)]/30",
        PARTIAL:
            "bg-[color:var(--damage-partial)]/15 text-[color:var(--damage-partial)] border-[color:var(--damage-partial)]/30",
        COMPLETE:
            "bg-[color:var(--damage-complete)]/15 text-[color:var(--damage-complete)] border-[color:var(--damage-complete)]/30",
    }[level];
}

function formatSubmittedAt(value: string, locale?: string): string {
    return formatDateTimeForDisplay(value, locale);
}

type QueueReport = ReportGeoJsonFeatureCollection["features"][number];

type ModerationStatusAction = "APPROVED" | "REJECTED" | "FLAGGED" | "UNDER_REVIEW";

type DamageFilter = "all" | DamageLevel;

type CursorStack = Array<string | null>;

type SortKey = "report" | "infra" | "date" | "damage";

type SortDirection = "asc" | "desc";

interface SortState {
    key: SortKey;
    direction: SortDirection;
}

interface PendingBulk {
    ids: string[];
    status: ModerationConfirmStatus;
}

const DAMAGE_SORT_RANK: Record<DamageLevel, number> = {
    MINIMAL: 1,
    PARTIAL: 2,
    COMPLETE: 3,
};

function asQueue(features: QueueReport[]): QueueReport[] {
    return features.filter((report) => (report.properties.moderationStatus ?? "PENDING") === "PENDING");
}


export default function ModerationPage() {
    const { t, i18n } = useTranslation();
    const { data: session } = useSession();
    const role = session?.user?.role?.trim().toLowerCase();
    const isAdmin = role === "admin";
    const canModerate = role === "admin" || role === "analyst";

    const [crisisId, setCrisisId] = useState<string | null>(null);
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [damageFilter, setDamageFilter] = useState<DamageFilter>("all");

    const [loading, setLoading] = useState(false);
    const [queue, setQueue] = useState<QueueReport[]>([]);
    const [cursors, setCursors] = useState<CursorStack>([null]);
    const [pageIdx, setPageIdx] = useState(0);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [pageSize, setPageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [sorting, setSorting] = useState<SortState>({ key: "date", direction: "desc" });
    const fetchIdRef = useRef(0);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [mutatingIds, setMutatingIds] = useState<Record<string, boolean>>({});
    const [pendingModeration, setPendingModeration] = useState<PendingBulk | null>(null);

    const [detailId, setDetailId] = useState<string | null>(null);

    const canFetch = Boolean(crisisId) || isAdmin;

    const fetchQueue = useCallback(async (cursor: string | null) => {
        if (!canFetch) {
            setQueue([]);
            setNextCursor(null);
            setTotalPages(1);
            return;
        }

        setLoading(true);
        const id = ++fetchIdRef.current;
        try {
            const response = await apiClient.reports.list({
                ...(crisisId ? { crisisId } : {}),
                cursor: cursor ?? undefined,
                limit: pageSize,
                moderationStatus: "PENDING",
                ...(dateFrom ? { dateFrom } : {}),
                ...(dateTo ? { dateTo } : {}),
                ...(damageFilter !== "all" ? { damageLevel: damageFilter } : {}),
            });
            if (id !== fetchIdRef.current) return;
            setQueue(asQueue(response.features));
            setNextCursor(response.meta.nextCursor);
            setTotalPages(Math.max(1, Math.ceil(response.meta.total / pageSize)));
            setSelectedIds((prev) =>
                new Set(Array.from(prev).filter((sid) => response.features.some((r) => r.id === sid))),
            );
        } finally {
            if (id === fetchIdRef.current) setLoading(false);
        }
    }, [canFetch, crisisId, dateFrom, dateTo, damageFilter, pageSize]);

    // Reset to page 0 on filter change
    useEffect(() => {
        setPageIdx(0);
        setCursors((prev) => (prev.length === 1 && prev[0] === null ? prev : [null]));
    }, [crisisId, dateFrom, dateTo, damageFilter, pageSize]);

    useEffect(() => {
        void fetchQueue(cursors[pageIdx] ?? null);
    }, [fetchQueue, cursors, pageIdx]);

    const goNext = () => {
        if (!nextCursor) return;
        const idx = pageIdx + 1;
        setCursors((prev) => {
            const next = [...prev];
            next[idx] = nextCursor;
            return next;
        });
        setPageIdx(idx);
    };

    const goPrev = () => {
        if (pageIdx === 0) return;
        setPageIdx((p) => p - 1);
    };


    const moderate = async (ids: string[], moderationStatus: ModerationStatusAction) => {
        if (ids.length === 0) return;

        setMutatingIds((prev) => {
            const next = { ...prev };
            for (const id of ids) next[id] = true;
            return next;
        });

        try {
            const previousQueue = queue;
            const previousSelected = selectedIds;

            await runOptimisticToastMutation({
                getSnapshot: () => ({ queue: previousQueue, selected: previousSelected }),
                applyOptimistic: () => {
                    setQueue((prev) => prev.filter((report) => !ids.includes(report.id)));
                    setSelectedIds((prev) => {
                        const next = new Set(prev);
                        for (const id of ids) next.delete(id);
                        return next;
                    });
                },
                commit: () => Promise.all(ids.map((id) => apiClient.reports.moderate(id, { moderationStatus }))).then(() => undefined),
                rollback: (snapshot) => {
                    setQueue(snapshot.queue);
                    setSelectedIds(snapshot.selected);
                },
                successMessage: t(`dashboard.moderation.toast_${moderationStatus.toLowerCase()}_success` as `dashboard.moderation.toast_${string}`),
                errorMessage: t("dashboard.moderation.toast_action_error"),
            });
        } finally {
            setMutatingIds((prev) => {
                const next = { ...prev };
                for (const id of ids) delete next[id];
                return next;
            });
        }
    };

    const requestModerationConfirm = (ids: string[], status: ModerationConfirmStatus) => {
        if (ids.length === 0) return;
        setPendingModeration({ ids, status });
    };

    const confirmModeration = async () => {
        if (!pendingModeration) return;
        const { ids, status } = pendingModeration;
        setPendingModeration(null);
        await moderate(ids, status);
    };

    const queueCount = queue.length;
    const allSelected = queueCount > 0 && selectedIds.size === queueCount;

    const sortedQueue = useMemo(() => {
        const sign = sorting.direction === "asc" ? 1 : -1;
        return [...queue].sort((a, b) => {
            if (sorting.key === "date") {
                const aTs = Date.parse(a.properties.submittedAt);
                const bTs = Date.parse(b.properties.submittedAt);
                return (aTs - bTs) * sign;
            }

            if (sorting.key === "damage") {
                const aRank = DAMAGE_SORT_RANK[a.properties.damageLevel] ?? 0;
                const bRank = DAMAGE_SORT_RANK[b.properties.damageLevel] ?? 0;
                return (aRank - bRank) * sign;
            }

            if (sorting.key === "infra") {
                const aInfra = a.properties.infraType ?? "";
                const bInfra = b.properties.infraType ?? "";
                return aInfra.localeCompare(bInfra) * sign;
            }

            const aLabel = a.properties.locationText ?? a.id;
            const bLabel = b.properties.locationText ?? b.id;
            return aLabel.localeCompare(bLabel) * sign;
        });
    }, [queue, sorting]);

    const handleSort = (key: SortKey) => {
        setSorting((prev) => {
            if (prev.key === key) {
                return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
            }
            return { key, direction: "asc" };
        });
    };

    const rows = useMemo(
        () =>
            sortedQueue.map((report) => {
                const isMutating = Boolean(mutatingIds[report.id]);
                const isSelected = selectedIds.has(report.id);
                const isActionDisabled = !canModerate || isMutating;

                return (
                    <tr
                        key={report.id}
                        className="border-b border-border/50 align-middle transition-colors hover:bg-muted/40"
                    >
                        <td className="px-3 py-2 align-middle">
                            <Checkbox
                                aria-label={`${t("dashboard.nav.reports")} ${report.id}`}
                                checked={isSelected}
                                disabled={!canModerate}
                                onCheckedChange={(checked) => {
                                    setSelectedIds((prev) => {
                                        const next = new Set(prev);
                                        if (checked === true) next.add(report.id);
                                        else next.delete(report.id);
                                        return next;
                                    });
                                }}
                            />
                        </td>
                        <td className="px-3 py-2 align-middle">
                            <div className="space-y-0.5">
                                <p
                                    className="max-w-[240px] truncate text-sm font-semibold text-foreground"
                                    title={report.properties.locationText ?? report.id}
                                >
                                    {report.properties.locationText ?? report.id}
                                </p>
                                <p className="text-xs text-muted-foreground">{report.id}</p>
                            </div>
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
                            {report.properties.infraType
                                ? t(`wizard.option.infra.${report.properties.infraType}` as const, {
                                    defaultValue: report.properties.infraType,
                                })
                                : "—"}
                        </td>
                        <td className="px-3 py-2 align-middle text-xs text-muted-foreground">
                            {formatSubmittedAt(report.properties.submittedAt, i18n?.language)}
                        </td>
                        <td className="px-3 py-2 align-middle">
                            <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${damageBadgeClass(report.properties.damageLevel)}`}
                            >
                                {t(`damage_${report.properties.damageLevel.toLowerCase()}` as `damage_${string}`)}
                            </span>
                        </td>
                        <td className="px-3 py-2 align-middle">
                            <TooltipProvider>
                                <div className="hidden flex-wrap items-center gap-1 md:flex">
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-xs"
                                                aria-label={t("reporter.my_reports.view_detail")}
                                                onClick={() => setDetailId(report.id)}
                                            >
                                                <Eye aria-hidden="true" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">{t("reporter.my_reports.view_detail")}</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-xs"
                                                aria-label={t(MODERATION_ACTION_LABEL_KEYS.APPROVED)}
                                                disabled={isActionDisabled}
                                                onClick={() => requestModerationConfirm([report.id], "APPROVED")}
                                            >
                                                <Check aria-hidden="true" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">{t(MODERATION_ACTION_LABEL_KEYS.APPROVED)}</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-xs"
                                                aria-label={t(MODERATION_ACTION_LABEL_KEYS.REJECTED)}
                                                disabled={isActionDisabled}
                                                onClick={() => requestModerationConfirm([report.id], "REJECTED")}
                                            >
                                                <X aria-hidden="true" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">{t(MODERATION_ACTION_LABEL_KEYS.REJECTED)}</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-xs"
                                                aria-label={t(MODERATION_ACTION_LABEL_KEYS.FLAGGED)}
                                                disabled={isActionDisabled}
                                                onClick={() => requestModerationConfirm([report.id], "FLAGGED")}
                                            >
                                                <Flag aria-hidden="true" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">{t(MODERATION_ACTION_LABEL_KEYS.FLAGGED)}</TooltipContent>
                                    </Tooltip>

                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="icon-xs"
                                                aria-label={t("dashboard.moderation.needs_more_info")}
                                                disabled={isActionDisabled}
                                                onClick={() => requestModerationConfirm([report.id], "UNDER_REVIEW")}
                                            >
                                                <MessageCircleQuestion aria-hidden="true" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">{t("dashboard.moderation.needs_more_info")}</TooltipContent>
                                    </Tooltip>
                                </div>
                            </TooltipProvider>

                            <div className="md:hidden">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon-xs"
                                            aria-label={t("dashboard.overview.table_col_actions")}
                                            data-testid={`moderation-row-actions-menu-${report.id}`}
                                        >
                                            <MoreVertical aria-hidden="true" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onSelect={() => setDetailId(report.id)}>
                                            {t("reporter.my_reports.view_detail")}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={isActionDisabled}
                                            onSelect={() => requestModerationConfirm([report.id], "APPROVED")}
                                        >
                                            {t(MODERATION_ACTION_LABEL_KEYS.APPROVED)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={isActionDisabled}
                                            onSelect={() => requestModerationConfirm([report.id], "REJECTED")}
                                        >
                                            {t(MODERATION_ACTION_LABEL_KEYS.REJECTED)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={isActionDisabled}
                                            onSelect={() => requestModerationConfirm([report.id], "FLAGGED")}
                                        >
                                            {t(MODERATION_ACTION_LABEL_KEYS.FLAGGED)}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={isActionDisabled}
                                            onSelect={() => requestModerationConfirm([report.id], "UNDER_REVIEW")}
                                        >
                                            {t("dashboard.moderation.needs_more_info")}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        </td>
                    </tr>
                );
            }),
        [sortedQueue, mutatingIds, selectedIds, t, canModerate, i18n?.language],
    );

    const loadingRows = useMemo(
        () =>
            Array.from({ length: 8 }).map((_, index) => (
                <tr key={`loading-${index}`} className="border-b border-border/50">
                    <td className="px-3 py-2" colSpan={6}>
                        <Skeleton className="h-8 w-full rounded-md" />
                    </td>
                </tr>
            )),
        [],
    );

    return (
        <div className="flex min-h-0 flex-col gap-4 p-4 md:p-6" style={{ height: 'calc(100dvh - var(--header-height))' }} data-density="operations">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-lg font-semibold text-foreground">{t("dashboard.nav.moderation")}</h1>
            </div>

            <div className="grid grid-cols-3 gap-2 lg:grid-cols-[220px_1fr_1fr_180px]">
                <div className="col-span-3 lg:col-span-1">
                    <CrisisSelector selectedId={crisisId} onSelect={setCrisisId} variant="inline" />
                </div>
                <Input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    aria-label={t("dashboard.export.fields.date_from")}
                    className="h-8 text-xs"
                />
                <Input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    aria-label={t("dashboard.export.fields.date_to")}
                    className="h-8 text-xs"
                />
                <Select value={damageFilter} onValueChange={(value) => setDamageFilter(value as DamageFilter)}>
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

            <section
                className="min-h-0 flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card"
                aria-label={t("dashboard.moderation.queue_region_label")}
            >
                {!canFetch ? (
                    <p className="p-4 text-sm text-muted-foreground">{t("dashboard.moderation.select_crisis_hint")}</p>
                ) : (
                    <>
                        {/* ── bulk action bar ──────────────────────────────── */}
                        {canModerate && selectedIds.size > 0 ? (
                            <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs">
                                <span className="font-medium text-foreground">
                                    {t("dashboard.moderation.rows_selected", {
                                        selected: selectedIds.size,
                                        total: queueCount,
                                    })}
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        data-testid="bulk-approve"
                                        onClick={() => requestModerationConfirm(Array.from(selectedIds), "APPROVED")}
                                    >
                                        {t(MODERATION_ACTION_LABEL_KEYS.APPROVED)}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => requestModerationConfirm(Array.from(selectedIds), "REJECTED")}
                                    >
                                        {t(MODERATION_ACTION_LABEL_KEYS.REJECTED)}
                                    </Button>
                                </div>
                            </div>
                        ) : null}

                        {/* ── scrollable table ─────────────────────────────── */}
                        <div className="min-h-0 flex-1 overflow-auto">
                            <table className="w-full border-collapse text-sm" role="table">
                                <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                                    <tr className="border-b border-border">
                                        <th className="w-10 px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                                            {canModerate ? (
                                                <Checkbox
                                                    aria-label={t("dashboard.moderation.select_all")}
                                                    checked={allSelected}
                                                    onCheckedChange={(checked) => {
                                                        if (checked === true) {
                                                            setSelectedIds(new Set(queue.map((report) => report.id)));
                                                            return;
                                                        }
                                                        setSelectedIds(new Set());
                                                    }}
                                                />
                                            ) : (
                                                <span className="sr-only">{t("dashboard.moderation.select_all")}</span>
                                            )}
                                        </th>
                                        <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-start"
                                                onClick={() => handleSort("report")}
                                            >
                                                {t("dashboard.nav.reports")}
                                                <ArrowUpDown aria-hidden="true" className="size-3" />
                                            </button>
                                        </th>
                                        <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-start"
                                                onClick={() => handleSort("infra")}
                                            >
                                                {t("dashboard.overview.table_col_infra")}
                                                <ArrowUpDown aria-hidden="true" className="size-3" />
                                            </button>
                                        </th>
                                        <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-start"
                                                onClick={() => handleSort("date")}
                                            >
                                                {t("dashboard.overview.table_col_date")}
                                                <ArrowUpDown aria-hidden="true" className="size-3" />
                                            </button>
                                        </th>
                                        <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 text-start"
                                                onClick={() => handleSort("damage")}
                                            >
                                                {t("dashboard.map.filter_damage_label")}
                                                <ArrowUpDown aria-hidden="true" className="size-3" />
                                            </button>
                                        </th>
                                        <th className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground">
                                            {t("dashboard.overview.table_col_actions")}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? loadingRows : queueCount === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                                                {t("dashboard.moderation.empty")}
                                            </td>
                                        </tr>
                                    ) : (
                                        rows
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* ── footer: row count + pagination ───────────────── */}
                        <TablePaginationControls
                            page={pageIdx + 1}
                            total={totalPages}
                            canGoPrev={pageIdx > 0}
                            canGoNext={Boolean(nextCursor)}
                            onPrev={goPrev}
                            onNext={goNext}
                            pageSize={pageSize}
                            onPageSizeChange={(nextPageSize) => {
                                if (nextPageSize === pageSize) {
                                    return;
                                }
                                setPageSize(nextPageSize);
                                setPageIdx(0);
                                setCursors([null]);
                            }}
                            className="px-3"
                        />
                    </>
                )}
            </section>

            <Sheet
                open={Boolean(detailId)}
                onOpenChange={(open) => {
                    if (!open) {
                        setDetailId(null);
                    }
                }}
            >
                <SheetContent
                    side={i18n.dir() === "rtl" ? "left" : "right"}
                    className="w-full overflow-y-auto p-0 sm:max-w-lg"
                >
                    <SheetHeader className="border-b border-border px-4 py-3">
                        <SheetTitle>{t("reporter.my_reports.report_detail_title")}</SheetTitle>
                        <SheetDescription>{detailId ?? ""}</SheetDescription>
                    </SheetHeader>

                    <div className="px-4 pb-4 pt-2">
                        {detailId ? <ReportDetailContent reportId={detailId} showAuditTrail canLoadAudit={canModerate} /> : null}
                    </div>
                </SheetContent>
            </Sheet>

            <ReportsModerationConfirmDialog
                open={Boolean(pendingModeration)}
                onOpenChange={(open) => {
                    if (!open) setPendingModeration(null);
                }}
                status={pendingModeration?.status ?? null}
                count={pendingModeration?.ids.length ?? 0}
                onConfirm={() => { void confirmModeration(); }}
            />
        </div>
    );
}
