"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ClipboardList, HardDrive, Search } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReportCard } from "@/components/shared/report-card";
import { ReportDetailContent } from "@/components/composed/report-detail-popover";
import { listAll, type QueuedReport } from "@/lib/offline/queue";
import { retryReport } from "@/lib/offline/sync";
import { DATA_CHANGE_EVENT } from "@/lib/offline/mode";
import { cn, formatCoords, useMediaQuery } from "@/lib/utils";

type DamageLevel = "MINIMAL" | "PARTIAL" | "COMPLETE";
type FilterKey = "all" | "pending" | "synced" | "failed";
type SyncStatusState = "local" | "queued" | "syncing" | "synced" | "failed";

type UiReport = {
  id: string;
  serverId?: string; // Server-assigned ID stored after successful offline sync
  createdAt: string;
  status: SyncStatusState;
  errorCode: string | null;
  crisisName: string;
  crisisType: string | null;
  damageLevel: DamageLevel | null;
  infraType: string | null;
  infraName: string | null;
  /** formatted coords ("lat, lng") or free-text description; null if unknown */
  locationText: string | null;
  pressingNeeds: string[];
  moderationStatus: string | null;
  isDuplicate: boolean;
};

function parseCoords(lat: unknown, lng: unknown): string | null {
  const la = typeof lat === "string" ? parseFloat(lat) : typeof lat === "number" ? lat : NaN;
  const lo = typeof lng === "string" ? parseFloat(lng) : typeof lng === "number" ? lng : NaN;
  if (isNaN(la) || isNaN(lo)) return null;
  return formatCoords(la, lo);
}

const PAGE_SIZE = 20;

function mapLocalStatus(status: QueuedReport["status"]): SyncStatusState {
  if (status === "draft") return "local";
  if (status === "queued") return "queued";
  if (status === "syncing") return "syncing";
  if (status === "synced") return "synced";
  return "failed";
}

// ─── local detail fallback ────────────────────────────────────────────────────

function LocalReportDetail({ report }: { report: UiReport }) {
  const { t } = useTranslation();

  const infraLabel = report.infraType
    ? t(`wizard.option.infra.${report.infraType}` as `wizard.option.infra.${string}`, { defaultValue: report.infraType })
    : null;
  const crisisTypeLabel = report.crisisType
    ? t(`wizard.option.crisis.${report.crisisType}` as `wizard.option.crisis.${string}`, { defaultValue: report.crisisType })
    : null;
  const damageLabel = report.damageLevel
    ? t(`damage_${report.damageLevel.toLowerCase()}` as `damage_${string}`)
    : null;

  const rows = [
    { label: t("reporter.wizard.fields.crisis"), value: [report.crisisName, crisisTypeLabel].filter(Boolean).join(" · ") },
    damageLabel ? { label: t("step.damage.legend"), value: damageLabel } : null,
    report.locationText ? { label: t("report_detail.location"), value: report.locationText } : null,
  ].filter((r): r is { label: string; value: string } => r !== null && r.value !== "");

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
        <HardDrive aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{t("reporter.my_reports.local_detail_notice")}</p>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="space-y-2 px-3 py-3">
          <p className="text-sm font-semibold text-card-foreground">
            {report.infraName ?? infraLabel ?? report.crisisName}
            {report.infraName && infraLabel && (
              <span className="ms-1 font-normal text-muted-foreground">· {infraLabel}</span>
            )}
          </p>
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <span className="text-xs font-medium text-card-foreground">{row.value}</span>
            </div>
          ))}
        </div>

        {report.pressingNeeds.length > 0 && (
          <>
            <div className="border-t border-border" />
            <div className="px-3 py-2">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("report_detail.needs")}
              </p>
              <div className="flex flex-wrap gap-1">
                {report.pressingNeeds.map((need) => (
                  <span key={need} className="rounded bg-primary/10 px-1.5 py-px text-xs font-medium text-primary">
                    {t(`wizard.option.pressing.${need}` as `wizard.option.pressing.${string}`, { defaultValue: need.replace(/_/g, " ") })}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function MyReportsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [reports, setReports] = useState<UiReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [viewId, setViewId] = useState<string | null>(null);
  const [viewReport, setViewReport] = useState<UiReport | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const local = await listAll();

        const items: UiReport[] = local.map((item) => {
          const s = item.formDataSerialized;
          const crisisId = typeof s.crisisId === "string" ? s.crisisId : "";
          const coords = parseCoords(s.latitude, s.longitude);
          const serverId = item.serverId
            ?? (item.status === "synced" && item.idempotencyKey === item.id ? item.id : undefined);
          return {
            id: item.id,
            serverId,
            createdAt: item.createdAt,
            status: mapLocalStatus(item.status),
            errorCode: item.lastError,
            crisisName: (typeof s.crisisName === "string" && s.crisisName) || crisisId,
            crisisType: typeof s.crisisType === "string" ? s.crisisType : null,
            damageLevel: (["MINIMAL", "PARTIAL", "COMPLETE"].includes(String(s.damageLevel))
              ? (s.damageLevel as DamageLevel)
              : null),
            infraType: typeof s.infraType === "string" ? s.infraType : null,
            infraName: typeof s.infraName === "string" && s.infraName ? s.infraName : null,
            locationText: coords ?? (typeof s.locationText === "string" && s.locationText ? s.locationText : null),
            pressingNeeds: Array.isArray(s.pressingNeeds) ? (s.pressingNeeds as string[]) : [],
            moderationStatus: null,
            isDuplicate: false,
          };
        });

        const sorted = items.sort((a, b) =>
          a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
        );

        if (!active) return;
        setReports(sorted);
      } catch {
        if (!active) return;
        setReports([]);
      } finally {
        if (!active) return;
        setLoading(false);
      }
    }

    void load();
    const refresh = () => { void load(); };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DATA_CHANGE_EVENT) : undefined;
    channel?.addEventListener("message", refresh);
    window.addEventListener(DATA_CHANGE_EVENT, refresh);
    return () => { active = false; channel?.close(); window.removeEventListener(DATA_CHANGE_EVENT, refresh); };
  }, []);

  const isEmpty = useMemo(() => !loading && reports.length === 0, [loading, reports]);

  const filteredReports = useMemo(() => {
    let items = reports;
    if (filter === "pending") items = items.filter((r) => r.status === "queued" || r.status === "syncing" || r.status === "local");
    else if (filter === "synced") items = items.filter((r) => r.status === "synced");
    else if (filter === "failed") items = items.filter((r) => r.status === "failed");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (r) =>
          (r.infraName ?? "").toLowerCase().includes(q) ||
          (r.crisisName ?? "").toLowerCase().includes(q) ||
          (r.locationText ?? "").toLowerCase().includes(q),
      );
    }
    return items;
  }, [reports, filter, search]);

  // Reset visible count when filter/search changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter, search]);

  const visibleReports = filteredReports.slice(0, visibleCount);
  const hasMore = filteredReports.length > visibleCount;

  async function onRetry(id: string) {
    await retryReport(id, fetch);
    const local = await listAll();
    setReports((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const updated = local.find((c) => c.id === id);
        return {
          ...item,
          status: updated ? mapLocalStatus(updated.status) : "synced",
          errorCode: updated?.lastError ?? null,
        };
      }),
    );
  }

  const FILTERS: FilterKey[] = ["all", "pending", "synced", "failed"];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <section className="space-y-3">
          {/* Title with count badge + search toggle */}
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-card-foreground">
              {t("reporter.my_reports.title")}
            </h2>
            {!loading && reports.length > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums text-primary-foreground">
                {reports.length > 99 ? "99+" : reports.length}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "ms-auto size-7 text-muted-foreground hover:bg-accent hover:text-foreground",
                showSearch && "bg-accent text-foreground",
              )}
              aria-label={t("reporter.my_reports.search_label")}
              aria-pressed={showSearch}
              onClick={() => {
                setShowSearch((v) => !v);
                if (showSearch) setSearch("");
              }}
            >
              <Search aria-hidden="true" className="size-3.5" />
            </Button>
          </div>

          {/* Saved-locally subtitle — no box so it cannot be confused with an input */}
          {!loading && reports.length > 0 && (
            <p className="-mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <HardDrive aria-hidden="true" className="size-3 shrink-0" />
              {t("reporter.my_reports.local_notice")}
            </p>
          )}

          {/* Search input — shown on toggle */}
          {showSearch && (
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                placeholder={t("reporter.my_reports.search_placeholder")}
                aria-label={t("reporter.my_reports.search_label")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 ps-8 text-xs"
                autoFocus
              />
            </div>
          )}

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("reporter.my_reports.filter_label")}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent"
                  }`}
              >
                {t(`reporter.my_reports.filter.${f}`)}
              </button>
            ))}
          </div>

          {/* Skeleton */}
          {loading && (
            <ul aria-busy="true" aria-label={t("reporter.my_reports.loading")} className="space-y-3">
              {[0, 1, 2].map((i) => (
                <li key={i} className="rounded-md border border-border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="mt-0.5 size-5 shrink-0 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3 w-1/2" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <ClipboardList aria-hidden="true" className="size-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t("reporter.my_reports.empty")}</p>
            </div>
          )}

          {!loading && !isEmpty && filteredReports.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <ClipboardList aria-hidden="true" className="size-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {search.trim()
                  ? t("reporter.my_reports.no_results", { query: search.trim() })
                  : t(`reporter.my_reports.empty_filter.${filter}`)}
              </p>
            </div>
          )}

          {/* Report list */}
          {!loading && visibleReports.length > 0 && (
            <ul className="space-y-3">
              {visibleReports.map((report) => (
                <li key={report.id}>
                  <ReportCard
                    id={report.id}
                    infrastructureName={report.infraName ?? report.crisisName}
                    infraType={report.infraType}
                    crisisName={report.infraName ? report.crisisName : null}
                    crisisType={report.crisisType}
                    locationText={report.locationText ?? ""}
                    damagedAt={report.createdAt}
                    damageLevel={report.damageLevel ?? "MINIMAL"}
                    syncStatus={
                      report.status === "synced" ? "synced"
                        : report.status === "failed" ? "failed"
                          : "pending"
                    }
                    moderationStatus={report.moderationStatus}
                    pressingNeeds={report.pressingNeeds}
                    errorCode={report.errorCode}
                    onRetry={report.status === "failed" ? () => onRetry(report.id) : undefined}
                    onEditRetry={report.status === "failed" ? () => router.push(`/report?draftId=${encodeURIComponent(report.id)}`) : undefined}
                    onView={() => { setViewId(report.id); setViewReport(report); }}
                  />
                </li>
              ))}
            </ul>
          )}

          {/* Load more */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              >
                {t("reporter.my_reports.load_more", { remaining: filteredReports.length - visibleCount })}
              </Button>
            </div>
          )}
        </section>
      </div>

      {/* Detail panel — bottom sheet on mobile, centered dialog on desktop */}
      {isDesktop ? (
        <Dialog open={!!viewId} onOpenChange={(o) => { if (!o) { setViewId(null); setViewReport(null); } }}>
          <DialogContent className="max-h-[85dvh] max-w-lg overflow-y-auto p-0">
            <DialogHeader className="px-5 pb-2 pt-5">
              <DialogTitle className="text-sm font-semibold">
                {t("reporter.my_reports.report_detail_title")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("reporter.my_reports.report_detail_title")}
              </DialogDescription>
            </DialogHeader>
            <div className="px-5 pb-6">
              {viewId && viewReport?.status === "synced" && viewReport.serverId
                ? <ReportDetailContent reportId={viewReport.serverId} fallback={viewReport ? <LocalReportDetail report={viewReport} /> : undefined} />
                : viewReport && <LocalReportDetail report={viewReport} />}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <Sheet open={!!viewId} onOpenChange={(o) => { if (!o) { setViewId(null); setViewReport(null); } }}>
          <SheetContent side="bottom" className="flex h-[70dvh] flex-col rounded-t-xl px-4 pb-8 pt-4">
            <SheetHeader className="shrink-0 p-0 pb-3">
              <SheetTitle className="text-start text-sm font-semibold">
                {t("reporter.my_reports.report_detail_title")}
              </SheetTitle>
              <SheetDescription className="sr-only">
                {t("reporter.my_reports.report_detail_title")}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {viewId && viewReport?.status === "synced" && viewReport.serverId
                ? <ReportDetailContent reportId={viewReport.serverId} fallback={viewReport ? <LocalReportDetail report={viewReport} /> : undefined} />
                : viewReport && <LocalReportDetail report={viewReport} />}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
