"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, Check, Eye, Flag, MoreVertical, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ReportsModerationConfirmDialog,
  type ModerationConfirmStatus,
} from "@/components/composed/reports-moderation-confirm-dialog";
import { ReportDetailContent } from "@/components/composed/report-detail-popover";
import { TablePaginationControls } from "@/components/composed/table-pagination-controls";
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
  apiClient,
  type DamageLevel,
  type ReportGeoJsonFeatureCollection,
  type ReportListFilters,
} from "@/lib/api/client";
import { useSession } from "@/lib/auth-client";
import { MODERATION_ACTION_LABEL_KEYS } from "@/lib/moderation-action-labels";
import { runOptimisticToastMutation } from "@/lib/optimistic-toast";
import { formatDateTimeForDisplay } from "@/lib/date-format";
import { cn } from "@/lib/utils";

// ─── types ─────────────────────────────────────────────────────────────────────

type ReportRow = ReportGeoJsonFeatureCollection["features"][number];

export type DashboardDamageFilter = "all" | DamageLevel;

export interface ReportsTableProps {
  crisisId: string | null;
  damageFilter: DashboardDamageFilter;
  dateFrom: string;
  dateTo: string;
  search: string;
  infraType?: string;
  moderationStatus?: string;
  /** Allow all-crises fetch without crisisId in table (admin-only) */
  isAdmin?: boolean;
  className?: string;
}

// ─── cursor stack pagination ──────────────────────────────────────────────────

type CursorStack = Array<string | null>; // index 0 = first page (null cursor)

interface PendingModeration {
  ids: string[];
  status: ModerationConfirmStatus;
}

const DAMAGE_SORT_RANK: Record<DamageLevel, number> = {
  MINIMAL: 1,
  PARTIAL: 2,
  COMPLETE: 3,
};

// ─── damage badge variant ─────────────────────────────────────────────────────

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

function statusBadgeVariant(
  status?: string | null,
): "default" | "secondary" | "destructive" | "outline" {
  if (!status) return "outline";
  return (
    {
      APPROVED: "default",
      REJECTED: "destructive",
      FLAGGED: "destructive",
      UNDER_REVIEW: "secondary",
      PENDING: "outline",
    }[status] ?? "outline"
  ) as "default" | "secondary" | "destructive" | "outline";
}

// ─── component ────────────────────────────────────────────────────────────────

const helper = createColumnHelper<ReportRow>();

export function ReportsTable({
  crisisId,
  damageFilter,
  dateFrom,
  dateTo,
  search,
  infraType,
  moderationStatus,
  isAdmin = false,
  className,
}: ReportsTableProps) {
  const { t, i18n } = useTranslation();
  const { data: session } = useSession();
  const role = session?.user?.role?.trim().toLowerCase();
  const canModerate = role === "admin" || role === "analyst";

  const [data, setData] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursors, setCursors] = useState<CursorStack>([null]);
  const [pageIdx, setPageIdx] = useState(0); // index into cursors stack
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [detailReportId, setDetailReportId] = useState<string | null>(null);
  const [mutatingIds, setMutatingIds] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingModeration, setPendingModeration] = useState<PendingModeration | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Track latest fetch to avoid stale updates
  const fetchIdRef = useRef(0);

  const fetch = useCallback(
    async (cursor: string | null) => {
      const shouldFetchAllCrises = !crisisId && isAdmin;

      // Table view requires selecting a crisis before querying reports.
      if (!crisisId && !shouldFetchAllCrises) {
        setData([]);
        setNextCursor(null);
        setTotalPages(1);
        setLoading(false);
        return;
      }
      setLoading(true);
      const id = ++fetchIdRef.current;

      try {
        const normalizedModerationStatus: ReportListFilters["moderationStatus"] =
          moderationStatus === "PENDING" ||
            moderationStatus === "FLAGGED" ||
            moderationStatus === "UNDER_REVIEW" ||
            moderationStatus === "APPROVED" ||
            moderationStatus === "REJECTED"
            ? moderationStatus
            : undefined;

        const result = await apiClient.reports.list({
          ...(crisisId ? { crisisId } : {}),
          cursor: cursor ?? undefined,
          limit: pageSize,
          damageLevel: damageFilter !== "all" ? (damageFilter as DamageLevel) : undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          moderationStatus: normalizedModerationStatus,
        });

        if (id !== fetchIdRef.current) return; // stale

        // Client-side search filter (API doesn't have text search param)
        const filtered = result.features.filter((f) => {
          if (infraType && f.properties.infraType !== infraType) {
            return false;
          }

          if (!search) {
            return true;
          }

          const loc = (f.properties.locationText ?? "").toLowerCase();
          const infra = (f.properties.infraType ?? "").toLowerCase();
          const q = search.toLowerCase();
          return loc.includes(q) || infra.includes(q) || f.id.toLowerCase().includes(q);
        });

        setData(filtered);
        setNextCursor(result.meta.nextCursor);
        setTotalPages(Math.max(1, Math.ceil(result.meta.total / pageSize)));
      } finally {
        if (id === fetchIdRef.current) setLoading(false);
      }
    },
    [
      crisisId,
      damageFilter,
      dateFrom,
      dateTo,
      search,
      infraType,
      moderationStatus,
      isAdmin,
      pageSize,
    ],
  );

  // On any filter change reset to page 0
  useEffect(() => {
    setPageIdx(0);
    // Only create a new array if the stack was non-trivial to avoid extra re-renders
    setCursors((prev) => (prev.length === 1 && prev[0] === null ? prev : [null]));
  }, [crisisId, damageFilter, dateFrom, dateTo, search, infraType, moderationStatus, pageSize]);

  useEffect(() => {
    void fetch(cursors[pageIdx] ?? null);
  }, [fetch, cursors, pageIdx]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => data.some((row) => row.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [data]);

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

  const requestModerationConfirm = (ids: string[], status: ModerationConfirmStatus) => {
    if (ids.length === 0) return;
    setPendingModeration({ ids, status });
  };

  const confirmModeration = async () => {
    if (!pendingModeration) return;

    const ids = pendingModeration.ids;
    const status = pendingModeration.status;

    setMutatingIds((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        next[id] = true;
      }
      return next;
    });

    try {
      const previousData = data;
      const previousSelected = selectedIds;

      await runOptimisticToastMutation({
        getSnapshot: () => ({ data: previousData, selected: previousSelected }),
        applyOptimistic: () => {
          setData((prev) => prev.map((row) => (
            ids.includes(row.id)
              ? {
                ...row,
                properties: {
                  ...row.properties,
                  moderationStatus: status,
                },
              }
              : row
          )));
          setSelectedIds((prev) => {
            const next = new Set(prev);
            for (const id of ids) {
              next.delete(id);
            }
            return next;
          });
        },
        commit: () => Promise.all(ids.map((id) => apiClient.reports.moderate(id, { moderationStatus: status }))).then(() => undefined),
        rollback: (snapshot) => {
          setData(snapshot.data);
          setSelectedIds(snapshot.selected);
        },
        successMessage: t("dashboard.reports.toast_moderation_success"),
        errorMessage: t("dashboard.reports.toast_moderation_error"),
      });
    } finally {
      setMutatingIds((prev) => {
        const next = { ...prev };
        for (const id of ids) {
          delete next[id];
        }
        return next;
      });
      setPendingModeration(null);
    }
  };

  const toggleRow = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  // ── column definitions ─────────────────────────────────────────────────────

  const columns = [
    helper.display({
      id: "select",
      header: () => {
        const allChecked = data.length > 0 && data.every((row) => selectedIds.has(row.id));
        return (
          <Checkbox
            aria-label={t("dashboard.nav.reports")}
            checked={allChecked}
            onCheckedChange={(checked) => {
              const shouldSelectAll = checked === true;
              setSelectedIds(shouldSelectAll ? new Set(data.map((row) => row.id)) : new Set());
            }}
          />
        );
      },
      cell: (info) => (
        <Checkbox
          aria-label={`${t("dashboard.nav.reports")} ${info.row.original.id}`}
          checked={selectedIds.has(info.row.original.id)}
          onCheckedChange={(checked) => toggleRow(info.row.original.id, checked === true)}
        />
      ),
    }),
    helper.accessor((row) => row.properties.submittedAt, {
      id: "date",
      header: ({ column }) => (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-start"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {t("dashboard.overview.table_col_date")}
          <ArrowUpDown aria-hidden="true" className="size-3" />
        </button>
      ),
      cell: (info) => {
        const val = info.getValue();
        if (!val) return "—";
        return formatDateTimeForDisplay(val, i18n?.language);
      },
      sortingFn: (a, b, id) => {
        const aTs = Date.parse((a.getValue(id) as string | undefined) ?? "");
        const bTs = Date.parse((b.getValue(id) as string | undefined) ?? "");
        const safeA = Number.isNaN(aTs) ? 0 : aTs;
        const safeB = Number.isNaN(bTs) ? 0 : bTs;
        return safeA - safeB;
      },
    }),
    helper.accessor((row) => row.properties.crisisId, {
      id: "crisis",
      header: () => t("dashboard.overview.table_col_crisis"),
      cell: (info) => info.getValue() ?? "—",
      enableSorting: false,
    }),
    helper.accessor((row) => row.properties.damageLevel, {
      id: "damage",
      header: ({ column }) => (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-start"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          {t("dashboard.overview.table_col_damage")}
          <ArrowUpDown aria-hidden="true" className="size-3" />
        </button>
      ),
      cell: (info) => {
        const level = info.getValue();
        return (
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              damageBadgeClass(level),
            )}
          >
            {t(`damage_${level.toLowerCase()}` as `damage_${string}`)}
          </span>
        );
      },
      sortingFn: (a, b, id) => {
        const aRank = DAMAGE_SORT_RANK[a.getValue(id) as DamageLevel] ?? 0;
        const bRank = DAMAGE_SORT_RANK[b.getValue(id) as DamageLevel] ?? 0;
        return aRank - bRank;
      },
    }),
    helper.accessor((row) => row.properties.infraType, {
      id: "infra",
      header: () => t("dashboard.overview.table_col_infra"),
      cell: (info) => {
        const infra = info.getValue();
        if (!infra) return "—";

        return t(`wizard.option.infra.${infra}` as const, { defaultValue: infra });
      },
    }),
    helper.accessor((row) => row.properties.locationText, {
      id: "location",
      header: () => t("dashboard.overview.table_col_location"),
      cell: (info) => (
        <span className="max-w-[180px] truncate" title={info.getValue() ?? ""}>
          {info.getValue() ?? "—"}
        </span>
      ),
    }),
    helper.accessor((row) => row.properties.moderationStatus, {
      id: "status",
      header: () => t("dashboard.overview.table_col_status"),
      cell: (info) => {
        const status = info.getValue() ?? "PENDING";
        return (
          <Badge variant={statusBadgeVariant(status)} className="text-[11px]">
            {t(`reporter.my_reports.moderation.${status}` as const, { defaultValue: status })}
          </Badge>
        );
      },
    }),
    helper.display({
      id: "actions",
      header: () => t("dashboard.overview.table_col_actions"),
      cell: (info) => {
        const rowStatus = info.row.original.properties.moderationStatus ?? "PENDING";
        const isMutating = Boolean(mutatingIds[info.row.original.id]);

        return (
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <div className="hidden flex-wrap items-center gap-1 md:flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-xs"
                      aria-label={t("reporter.my_reports.view_detail")}
                      onClick={() => setDetailReportId(info.row.original.id)}
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
                      disabled={isMutating || rowStatus === "APPROVED"}
                      onClick={() => requestModerationConfirm([info.row.original.id], "APPROVED")}
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
                      disabled={isMutating || rowStatus === "REJECTED"}
                      onClick={() => requestModerationConfirm([info.row.original.id], "REJECTED")}
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
                      disabled={isMutating}
                      onClick={() => requestModerationConfirm([info.row.original.id], "FLAGGED")}
                    >
                      <Flag aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{t(MODERATION_ACTION_LABEL_KEYS.FLAGGED)}</TooltipContent>
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
                    data-testid={`row-actions-menu-${info.row.original.id}`}
                  >
                    <MoreVertical aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setDetailReportId(info.row.original.id)}>
                    {t("reporter.my_reports.view_detail")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isMutating || rowStatus === "APPROVED"}
                    onSelect={() => requestModerationConfirm([info.row.original.id], "APPROVED")}
                  >
                    {t(MODERATION_ACTION_LABEL_KEYS.APPROVED)}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isMutating || rowStatus === "REJECTED"}
                    onSelect={() => requestModerationConfirm([info.row.original.id], "REJECTED")}
                  >
                    {t(MODERATION_ACTION_LABEL_KEYS.REJECTED)}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isMutating}
                    onSelect={() => requestModerationConfirm([info.row.original.id], "FLAGGED")}
                  >
                    {t(MODERATION_ACTION_LABEL_KEYS.FLAGGED)}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        );
      },
    }),
  ];

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  });

  // ── render ─────────────────────────────────────────────────────────────────

  if (loading && data.length === 0) {
    return (
      <div
        aria-busy="true"
        aria-label={t("dashboard.overview.table_loading")}
        className={cn("flex flex-col gap-2 p-4", className)}
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      {selectedIds.size > 0 && (
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-3 py-2 text-xs">
          <span className="font-medium text-foreground">
            {t("dashboard.moderation.rows_selected", {
              selected: selectedIds.size,
              total: table.getRowModel().rows.length,
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
      )}

      {/* ── scrollable table ─────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse" role="grid">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-border">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    scope="col"
                    className="px-3 py-2 text-start text-xs font-semibold text-muted-foreground whitespace-nowrap"
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  {t("dashboard.overview.table_empty")}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border/50 align-middle transition-colors hover:bg-muted/40"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 align-middle text-xs text-muted-foreground">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
      />

      <Sheet
        open={Boolean(detailReportId)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailReportId(null);
          }
        }}
      >
        <SheetContent
          side={i18n.dir() === "rtl" ? "left" : "right"}
          className="w-full overflow-y-auto p-0 sm:max-w-lg"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle>{t("reporter.my_reports.report_detail_title")}</SheetTitle>
            <SheetDescription>
              {detailReportId ?? ""}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4 pt-2">
            {detailReportId ? <ReportDetailContent reportId={detailReportId} showAuditTrail canLoadAudit={canModerate} /> : null}
          </div>
        </SheetContent>
      </Sheet>

      <ReportsModerationConfirmDialog
        open={Boolean(pendingModeration)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingModeration(null);
          }
        }}
        status={pendingModeration?.status ?? null}
        count={pendingModeration?.ids.length ?? 0}
        onConfirm={() => {
          void confirmModeration();
        }}
      />
    </div>
  );
}
