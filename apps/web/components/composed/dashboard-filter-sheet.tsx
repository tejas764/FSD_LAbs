"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// ─── types ─────────────────────────────────────────────────────────────────────

export interface AdvancedFilters {
  dateFrom: string;
  dateTo: string;
  infraType: string;
  moderationStatus: string;
  timePeriod: string;
}

export type DashboardFilterSection = "timePeriod" | "infraType" | "moderationStatus";

export interface DashboardFilterSheetProps {
  value: AdvancedFilters;
  onApply: (filters: AdvancedFilters) => void;
  sections?: DashboardFilterSection[];
  emptyValue?: AdvancedFilters;
}

const EMPTY_FILTERS: AdvancedFilters = {
  dateFrom: "",
  dateTo: "",
  infraType: "",
  moderationStatus: "",
  timePeriod: "",
};

const INFRA_TYPES = [
  "RESIDENTIAL",
  "COMMERCIAL",
  "GOVERNMENT",
  "UTILITY",
  "TRANSPORT_COMMUNICATION",
  "COMMUNITY",
  "PUBLIC_RECREATION",
  "OTHER",
] as const;

const MODERATION_STATUSES = [
  "PENDING",
  "FLAGGED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
] as const;

const TIME_PERIODS = ["7d", "30d", "90d", "365d", "all", "custom"] as const;
const DEFAULT_SECTIONS: DashboardFilterSection[] = ["timePeriod", "infraType", "moderationStatus"];

// ─── component ────────────────────────────────────────────────────────────────

export function DashboardFilterSheet({
  value,
  onApply,
  sections = DEFAULT_SECTIONS,
  emptyValue = EMPTY_FILTERS,
}: DashboardFilterSheetProps) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<AdvancedFilters>(value);
  const [open, setOpen] = useState(false);
  const visibleSections = new Set(sections);
  const showTimePeriod = visibleSections.has("timePeriod");
  const showInfraType = visibleSections.has("infraType");
  const showModerationStatus = visibleSections.has("moderationStatus");

  const sheetSide = i18n.dir() === "rtl" ? "left" : "right";

  const hasActiveFilters =
    (showTimePeriod && (
      value.timePeriod !== emptyValue.timePeriod ||
      value.dateFrom !== emptyValue.dateFrom ||
      value.dateTo !== emptyValue.dateTo
    )) ||
    (showInfraType && value.infraType !== emptyValue.infraType) ||
    (showModerationStatus && value.moderationStatus !== emptyValue.moderationStatus);

  function handleApply() {
    onApply(draft);
    setOpen(false);
  }

  function handleClear() {
    setDraft(emptyValue);
    onApply(emptyValue);
    setOpen(false);
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      // Re-sync draft from current applied value when opening
      setDraft(value);
    }
    setOpen(next);
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-8 gap-1.5 text-xs"
          aria-label={t("dashboard.overview.filter_label")}
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          {t("dashboard.overview.filter_label")}
          {hasActiveFilters && (
            <span
              aria-hidden="true"
              className="absolute -end-1 -top-1 flex size-3 items-center justify-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground"
            />
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side={sheetSide}
        className="w-[320px] p-0 sm:w-[380px] flex flex-col"
      >
        <SheetHeader className="border-b border-border px-4 py-3 shrink-0">
          <SheetTitle>{t("dashboard.overview.filter_label")}</SheetTitle>
          <SheetDescription className="sr-only">
            {t("dashboard.overview.filter_date_range")}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 px-4 py-4">
            {/* Time period */}
            {showTimePeriod && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-time-period" className="text-sm font-medium">
                  {t("dashboard.overview.filter_date_range")}
                </Label>
                <Select
                  value={draft.timePeriod || ""}
                  onValueChange={(v) => {
                    if (v !== "custom") {
                      setDraft((d) => ({ ...d, timePeriod: v, dateFrom: "", dateTo: "" }));
                    } else {
                      setDraft((d) => ({ ...d, timePeriod: v }));
                    }
                  }}
                >
                  <SelectTrigger id="filter-time-period" className="h-8 text-xs" aria-label={t("dashboard.overview.filter_date_range")}>
                    <SelectValue placeholder={t("dashboard.overview.period_all")} />
                  </SelectTrigger>
                  <SelectContent portal={false} side="bottom" align="start" position="popper">
                    {TIME_PERIODS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`dashboard.overview.period_${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {draft.timePeriod === "custom" && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="filter-date-from" className="text-xs">
                        {t("dashboard.overview.filter_date_from")}
                      </Label>
                      <Input
                        id="filter-date-from"
                        type="date"
                        value={draft.dateFrom}
                        onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="filter-date-to" className="text-xs">
                        {t("dashboard.overview.filter_date_to")}
                      </Label>
                      <Input
                        id="filter-date-to"
                        type="date"
                        value={draft.dateTo}
                        onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Infrastructure type */}
            {showInfraType && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-infra-type" className="text-sm font-medium">
                  {t("dashboard.overview.filter_infra_type")}
                </Label>
                <Select
                  value={draft.infraType || "all"}
                  onValueChange={(v) => setDraft((d) => ({ ...d, infraType: v === "all" ? "" : v }))}
                >
                  <SelectTrigger id="filter-infra-type" className="h-8 text-xs" aria-label={t("dashboard.overview.filter_infra_type")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portal={false} side="bottom" align="start" position="popper">
                    <SelectItem value="all">{t("dashboard.map.filter_all")}</SelectItem>
                    {INFRA_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`wizard.option.infra.${type}` as const, { defaultValue: type.replace(/_/g, " ") })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Moderation status */}
            {showModerationStatus && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="filter-moderation" className="text-sm font-medium">
                  {t("dashboard.overview.filter_moderation_status")}
                </Label>
                <Select
                  value={draft.moderationStatus || "all"}
                  onValueChange={(v) =>
                    setDraft((d) => ({ ...d, moderationStatus: v === "all" ? "" : v }))
                  }
                >
                  <SelectTrigger id="filter-moderation" className="h-8 text-xs" aria-label={t("dashboard.overview.filter_moderation_status")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent portal={false} side="bottom" align="start" position="popper">
                    <SelectItem value="all">{t("dashboard.map.filter_all")}</SelectItem>
                    {MODERATION_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`reporter.my_reports.moderation.${s}` as const, { defaultValue: s.replace(/_/g, " ") })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="border-t border-border px-4 py-3 sm:flex-col shrink-0">
          <Button onClick={handleApply} className="w-full">
            {t("dashboard.overview.filter_apply")}
          </Button>
          <Button variant="ghost" size="sm" className="w-full gap-1.5" onClick={handleClear}>
            <X className="size-3.5" aria-hidden="true" />
            {t("dashboard.overview.filter_clear")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
