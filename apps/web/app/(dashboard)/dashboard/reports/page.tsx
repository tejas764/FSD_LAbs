"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Map, Table2 } from "lucide-react";

import { useSession } from "@/lib/auth-client";
import { CrisisSelector } from "@/components/composed/crisis-selector";
import { DashboardFilterSheet, type AdvancedFilters } from "@/components/composed/dashboard-filter-sheet";
import { DashboardMapView } from "@/components/composed/dashboard-map-view";
import { ReportsTable, type DashboardDamageFilter } from "@/components/composed/reports-table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const EMPTY_FILTERS: AdvancedFilters = {
  dateFrom: "",
  dateTo: "",
  infraType: "",
  moderationStatus: "",
  timePeriod: "",
};

type ReportsView = "table" | "map";

export default function DashboardReportsPage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role?.trim().toLowerCase() === "admin";

  const [view, setView] = useState<ReportsView>("table");
  const [crisisId, setCrisisId] = useState<string | null>(null);
  const [damageFilter, setDamageFilter] = useState<DashboardDamageFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(EMPTY_FILTERS);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  return (
    <div className="flex min-h-0 flex-col gap-4 p-4 md:p-6" style={{ height: 'calc(100dvh - var(--header-height))' }} data-density="operations">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-foreground">{t("dashboard.nav.reports")}</h1>
        <div className="flex items-center gap-2">
          <DashboardFilterSheet value={advancedFilters} onApply={setAdvancedFilters} />
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => { if (v) setView(v as ReportsView); }}
            variant="outline"
            aria-label={t("dashboard.overview.view_toggle_group_label")}
            className="h-8"
          >
            <ToggleGroupItem value="table" aria-label={t("dashboard.overview.view_table")} className="h-8 gap-1.5 px-3 text-xs">
              <Table2 aria-hidden="true" className="size-3.5" />
              {t("dashboard.overview.view_table")}
            </ToggleGroupItem>
            <ToggleGroupItem value="map" aria-label={t("dashboard.overview.view_map")} className="h-8 gap-1.5 px-3 text-xs">
              <Map aria-hidden="true" className="size-3.5" />
              {t("dashboard.overview.view_map")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 lg:grid-cols-[220px_1fr_160px]">
        <div className="min-w-0">
          <CrisisSelector selectedId={crisisId} onSelect={setCrisisId} variant="inline" />
        </div>

        <Input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          aria-label={t("reporter.map.search_label")}
          placeholder={t("reporter.map.search_placeholder")}
          className="h-8 text-xs"
        />

        <Select value={damageFilter} onValueChange={(v) => setDamageFilter(v as DashboardDamageFilter)}>
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

      <section className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
        {view === "map" ? (
          <DashboardMapView
            crisisId={crisisId}
            damageFilter={damageFilter}
            dateFrom={advancedFilters.dateFrom}
            dateTo={advancedFilters.dateTo}
            infraType={advancedFilters.infraType}
            moderationStatus={advancedFilters.moderationStatus}
            search={search}
          />
        ) : (
          <ReportsTable
            crisisId={crisisId}
            damageFilter={damageFilter}
            dateFrom={advancedFilters.dateFrom}
            dateTo={advancedFilters.dateTo}
            search={search}
            infraType={advancedFilters.infraType}
            moderationStatus={advancedFilters.moderationStatus}
            isAdmin={isAdmin}
            className="h-full"
          />
        )}
      </section>
    </div>
  );
}
