"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ShieldCheck,
  CircleX,
  Search,
  MapPin,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { ReportDetailPopover } from "@/components/composed/report-detail-popover";
import { cn, formatCoords } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";
import type { ReportMapFeature } from "./leaflet-report-map";
import type { Crisis } from "@/lib/api/client";

// ─── types ────────────────────────────────────────────────────────────────────

type DamageFilter = "all" | "MINIMAL" | "PARTIAL" | "COMPLETE";

interface ReportSidebarProps {
  features: ReportMapFeature[];
  reportCount: number;
  /** Total reports in the area from the API (may exceed loaded count when truncated) */
  totalInArea?: number | null;
  /** True when the API returned more results than the page size */
  isTruncated?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  /** The active crisis — shows banner above list when provided */
  crisis?: Crisis | null;
  /** Crisis selector node — rendered at the top of controls on both desktop and mobile */
  crisisSelector?: React.ReactNode;
  /**
   * When provided, the dashboard toolbar owns filtering. The sidebar suppresses
   * its own search/filter chip UI and applies this search term to the list.
   */
  externalSearch?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const DAMAGE_ICON: Record<string, React.ElementType> = {
  MINIMAL: ShieldCheck,
  PARTIAL: AlertTriangle,
  COMPLETE: CircleX,
};

const DAMAGE_COLOR: Record<string, string> = {
  MINIMAL: "text-[color:var(--damage-none)]",
  PARTIAL: "text-[color:var(--damage-partial)]",
  COMPLETE: "text-[color:var(--damage-complete)]",
};

const DAMAGE_BORDER: Record<string, string> = {
  MINIMAL: "border-s-[color:var(--damage-none)]",
  PARTIAL: "border-s-[color:var(--damage-partial)]",
  COMPLETE: "border-s-[color:var(--damage-complete)]",
};

// ─── main component ───────────────────────────────────────────────────────────

export function ReportSidebar({
  features,
  reportCount,
  totalInArea,
  isTruncated = false,
  selectedId,
  onSelect,
  onClose,
  crisis,
  crisisSelector,
  externalSearch,
}: ReportSidebarProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [filter, setFilter] = useState<DamageFilter>("all");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // When the parent controls search (dashboard mode), use that value.
  // Otherwise use the internal search state.
  const activeSearch = externalSearch !== undefined ? externalSearch : search;

  // Damage breakdown counts (computed from all features, not filtered)
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = { MINIMAL: 0, PARTIAL: 0, COMPLETE: 0 };
    for (const f of features) {
      if (f.damageLevel in counts) counts[f.damageLevel]++;
    }
    return counts;
  }, [features]);

  const filtered = useMemo(() => {
    let items = features;
    // Internal damage filter only applies in uncontrolled (reporter) mode
    if (externalSearch === undefined && filter !== "all") {
      items = items.filter((f) => f.damageLevel === filter);
    }
    if (activeSearch.trim()) {
      const q = activeSearch.trim().toLowerCase();
      items = items.filter(
        (f) =>
          f.id.toLowerCase().includes(q) ||
          `${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}`.includes(q) ||
          f.damageLevel.toLowerCase().includes(q) ||
          (f.infraName ?? "").toLowerCase().includes(q) ||
          (f.infraType ?? "").toLowerCase().includes(q) ||
          (f.locationText ?? "").toLowerCase().includes(q),
      );
    }
    return items;
  }, [features, filter, activeSearch, externalSearch]);

  // ── Shared panel controls (crisis selector + search + filter chips) ────────
  // Suppressed when parent controls filtering (dashboard toolbar mode).
  const showInternalControls = externalSearch === undefined;

  const panelControls = showInternalControls ? (
    <>
      {crisisSelector}
      <ReportControls
        crisis={crisis}
        features={features}
        breakdown={breakdown}
        filter={filter}
        setFilter={setFilter}
        search={search}
        setSearch={setSearch}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        reportCount={reportCount}
        isMobile={isMobile}
      />
    </>
  ) : (
    // Dashboard mode: truncation warning only.
    // The count is shown by BottomSheet's own header on mobile, and by the
    // desktop aside separately below — so we must not duplicate it here.
    isTruncated && totalInArea !== null && totalInArea !== undefined ? (
      <div
        role="status"
        aria-live="polite"
        className="flex shrink-0 items-start gap-1.5 border-b border-warning/30 bg-warning/10 px-3 py-2"
      >
        <span aria-hidden="true" className="mt-px text-sm leading-none text-warning">⚠️</span>
        <p className="text-[11px] leading-snug text-warning">
          {t("reporter.map.truncation_hint")}
        </p>
      </div>
    ) : null
  );

  // ── Mobile: bottom sheet ─────────────────────────────────────────────────
  if (isMobile) {
    return (
      <BottomSheet reportCount={reportCount} controls={panelControls}>
        <ReportList
          features={filtered}
          selectedId={selectedId}
          onSelect={onSelect}
          onClose={onClose}
          isMobile
        />
      </BottomSheet>
    );
  }

  // ── Desktop panel ────────────────────────────────────────────────────────
  return (
    <aside
      id="report-list"
      aria-label={t("reporter.map.sidebar_label")}
      className="flex h-full min-h-0 w-full flex-col bg-card"
    >
      {/* Dashboard mode: count header rendered here (not in panelControls so
          mobile BottomSheet doesn't duplicate it in the controls slot). */}
      {!showInternalControls && (
        <div className="shrink-0 border-b border-border">
          <div className="flex items-center px-3 py-2">
            <p className="text-sm font-semibold text-card-foreground">
              {isTruncated && totalInArea !== null && totalInArea !== undefined
                ? t("reporter.map.report_count_truncated", {
                  loaded: reportCount,
                  total: totalInArea.toLocaleString(),
                })
                : t("reporter.map.report_count", { count: reportCount })}
            </p>
          </div>
        </div>
      )}
      {panelControls}

      {/* ── Report list ───────────────────────────────────────────────────── */}
      <ReportList
        features={filtered}
        selectedId={selectedId}
        onSelect={onSelect}
        onClose={onClose}
        isMobile={false}
      />
    </aside>
  );
}

// ─── shared panel controls ─────────────────────────────────────────────────

interface ReportControlsProps {
  crisis?: Crisis | null;
  features: ReportMapFeature[];
  breakdown: Record<string, number>;
  filter: DamageFilter;
  setFilter: (f: DamageFilter) => void;
  search: string;
  setSearch: (s: string) => void;
  searchOpen: boolean;
  setSearchOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  reportCount: number;
  isMobile: boolean;
}

/**
 * Shared controls rendered in both the desktop panel and the mobile bottom
 * sheet's `controls` slot: crisis banner, report count / search toggle
 * (desktop only), search input, and filter chips with inline breakdown counts.
 */
function ReportControls({
  crisis: _crisis,
  breakdown,
  filter,
  setFilter,
  search,
  setSearch,
  searchOpen,
  setSearchOpen,
  reportCount,
  isMobile,
}: ReportControlsProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* ── Panel header: count + search toggle (desktop only) ────────────── */}
      {!isMobile && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-3 py-2">
          <p className="flex-1 text-sm font-semibold text-card-foreground">
            {t("reporter.map.report_count", { count: reportCount })}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "size-7 text-muted-foreground hover:bg-accent hover:text-foreground",
              searchOpen && "bg-accent text-foreground",
            )}
            aria-label={t("reporter.map.search_label")}
            aria-pressed={searchOpen}
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setSearch("");
            }}
          >
            <Search aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      )}

      {/* ── Search: always visible on mobile, toggle on desktop ───────────── */}
      {(isMobile || searchOpen) && (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              placeholder={t("reporter.map.search_placeholder")}
              aria-label={t("reporter.map.search_label")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 ps-8 text-xs"
              autoFocus={!isMobile && searchOpen}
            />
          </div>
        </div>
      )}

      {/* ── Filter chips with inline breakdown counts ──────────────────────── */}
      <div
        className="flex shrink-0 flex-wrap gap-1.5 border-b border-border px-3 py-2"
        role="group"
        aria-label={t("reporter.map.report_list_label")}
      >
        {(["all", "MINIMAL", "PARTIAL", "COMPLETE"] as DamageFilter[]).map((f) => {
          const count = f === "all" ? reportCount : breakdown[f] ?? 0;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-accent",
              )}
            >
              {f === "all"
                ? t("reporter.my_reports.filter.all")
                : t(`damage_${f.toLowerCase()}` as `damage_${string}`)}
              <Badge
                data-testid={f !== "all" ? `breakdown-${f}` : undefined}
                variant={filter === f ? "default" : "secondary"}
                className={cn(
                  "min-w-[16px] justify-center tabular-nums",
                  filter === f
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "",
                )}
              >
                {count}
              </Badge>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ─── shared list ──────────────────────────────────────────────────────────────

interface ReportListProps {
  features: ReportMapFeature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  isMobile: boolean;
}

function ReportCard({
  f,
  isSelected,
  onSelect,
}: {
  f: ReportMapFeature;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const DmgIcon = DAMAGE_ICON[f.damageLevel] ?? ShieldCheck;
  const colorClass = DAMAGE_COLOR[f.damageLevel] ?? "text-muted-foreground";
  const borderClass = DAMAGE_BORDER[f.damageLevel] ?? "";
  const timeAgo = formatRelativeTime(f.submittedAt, t);
  const location = f.locationText ?? formatCoords(f.lat, f.lng);

  // primary label — infraName first, then infra type, then damage level
  const infraLabel = f.infraType
    ? t(`wizard.option.infra.${f.infraType}` as `wizard.option.infra.${string}`, { defaultValue: f.infraType })
    : null;
  const damageLabel = t(`damage_${f.damageLevel.toLowerCase()}` as `damage_${string}`);
  const primaryLabel = f.infraName ?? (infraLabel ?? damageLabel);
  const subtypeLabel = f.infraName && infraLabel ? infraLabel : null;

  const crisisLabel = f.crisisType
    ? t(`wizard.option.crisis.${f.crisisType}` as `wizard.option.crisis.${string}`, { defaultValue: f.crisisType })
    : null;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full cursor-pointer items-start gap-2 border-b border-border border-s-4 px-3 py-2.5 text-start transition-colors",
        "hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        borderClass,
        isSelected && "bg-accent/50",
      )}
      aria-pressed={isSelected}
      onClick={() => onSelect(f.id)}
    >
      {/* Damage icon */}
      <DmgIcon aria-hidden="true" className={cn("mt-px size-3.5 shrink-0", colorClass)} />

      <div className="min-w-0 flex-1 space-y-0.5">
        {/* Row 1: infraName · infraType + crisis type right side */}
        <div className="flex items-start justify-between mb-1">
          <span className="text-[12px] font-semibold leading-snug text-card-foreground">
            {primaryLabel}
            {subtypeLabel && (
              <span className="font-normal text-muted-foreground"> · {subtypeLabel}</span>
            )}
          </span>
          {crisisLabel && (
            <span className="shrink-0 text-[10px] leading-tight text-muted-foreground">{crisisLabel}</span>
          )}
        </div>

        {/* Row 2: location · version? · timeAgo */}
        <div className="flex items-center gap-2">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[11px] leading-tight text-muted-foreground">
            {location}
            {f.version > 1 && (
              <>
                <span aria-hidden="true" className="mx-1 opacity-40">·</span>
                <span>{t("reporter.my_reports.version", { n: f.version })}</span>
              </>
            )}
            <span aria-hidden="true" className="mx-1 opacity-40">·</span>
            {timeAgo}
          </span>
        </div>

        {/* Duplicate badge */}
        {f.isDuplicate && (
          <span className="mt-0.5 inline-flex rounded bg-warning/10 px-1 py-px text-[10px] font-medium leading-tight text-warning">
            {t("reporter.my_reports.duplicate")}
          </span>
        )}
      </div>
    </button>
  );
}

function ReportList({ features, selectedId, onSelect, isMobile }: ReportListProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);

  // Estimated row height: ~56px (2 text lines + padding)
  const ITEM_ESTIMATE_PX = 56;

  // TanStack Virtual exposes non-memoizable functions; keep this local rather than refactoring around the compiler warning.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: features.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_ESTIMATE_PX,
    overscan: 8,
  });

  // Auto-scroll to selected item when selectedId changes
  useEffect(() => {
    if (!selectedId) return;
    const idx = features.findIndex((f) => f.id === selectedId);
    if (idx !== -1) {
      rowVirtualizer.scrollToIndex(idx, { align: "auto", behavior: "smooth" });
    }
  }, [selectedId, features, rowVirtualizer]);

  if (features.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center px-4 py-8"
        role="region"
        aria-label={t("reporter.map.report_list_label")}
      >
        <p className="text-center text-sm text-muted-foreground">{t("reporter.map.empty")}</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="flex-1 overflow-y-auto"
      role="list"
      aria-label={t("reporter.map.report_list_label")}
    >
      {/* Total scroll height for the virtualizer */}
      <div
        style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const f = features[virtualRow.index];
          const isSelected = f.id === selectedId;
          const card = (
            <ReportCard
              f={f}
              isSelected={isSelected}
              onSelect={onSelect}
            />
          );

          return (
            <div
              key={f.id}
              role="listitem"
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {isMobile ? (
                card
              ) : (
                <ReportDetailPopover reportId={f.id} mode="hover">
                  {card}
                </ReportDetailPopover>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
