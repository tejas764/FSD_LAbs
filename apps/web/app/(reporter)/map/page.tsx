"use client";

import Link from "next/link";
import { useState, useCallback, useMemo } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { MapReporterView } from "@/components/composed/map-reporter-view";
import { ReportSidebar } from "@/components/composed/report-sidebar";
import { CrisisSelector } from "@/components/composed/crisis-selector";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useReportPanel } from "@/lib/report-panel-context";
import type { ReportMapFeature } from "@/components/composed/leaflet-report-map";
import type { Crisis } from "@/lib/api/client";

export default function ReporterLandingPage() {
  const { t } = useTranslation();
  const [features, setFeatures] = useState<ReportMapFeature[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCrisisId, setSelectedCrisisId] = useState<string | null>(null);
  const [activeCrisis, setActiveCrisis] = useState<Crisis | null>(null);
  const {
    collapsed: sidebarCollapsed,
    toggle: handleToggle,
  } = useReportPanel() ?? { collapsed: false, toggle: () => { } };
  const { state: navSidebarState, isMobile: navSidebarMobile } = useSidebar();

  // When crisis changes, compute fitBounds from Crisis.extentBBox [minLng, minLat, maxLng, maxLat]
  // API returns [minLng, minLat, maxLng, maxLat] but Leaflet fitBounds wants [south, west, north, east]
  // Memoised on activeCrisis reference to prevent FitBoundsHandler from re-firing on every render.
  const fitBounds = useMemo<[number, number, number, number] | null>(() => {
    if (!activeCrisis?.extentBBox) return null;
    return [
      activeCrisis.extentBBox[1], // south = minLat
      activeCrisis.extentBBox[0], // west = minLng
      activeCrisis.extentBBox[3], // north = maxLat
      activeCrisis.extentBBox[2], // east = maxLng
    ];
  }, [activeCrisis]);

  // Position the report panel flush with the right edge of the nav sidebar so
  // z-stacking above the nav (z-20 > z-10) doesn't cause visual overlap.
  const reportPanelLeft = navSidebarMobile
    ? "0px"
    : navSidebarState === "expanded"
      ? "var(--sidebar-width)"
      : "var(--sidebar-width-icon)";

  const handleFeaturesLoaded = useCallback((f: ReportMapFeature[]) => {
    setFeatures(f);
  }, []);
  const handleSelect = useCallback((id: string) => setSelectedId(id), []);
  const handleClose = useCallback(() => setSelectedId(null), []);
  const handleCrisisSelect = useCallback((id: string | null) => {
    setSelectedCrisisId(id);
  }, []);
  const handleCrisisLoaded = useCallback((crisis: Crisis | null) => {
    setActiveCrisis(crisis);
  }, []);

  // CrisisSelector appears inside the report panel (above list) on both mobile and desktop
  const crisisSelector = (
    <CrisisSelector
      selectedId={selectedCrisisId}
      onSelect={handleCrisisSelect}
      onCrisisLoaded={handleCrisisLoaded}
    />
  );

  // Shared sidebar JSX to avoid duplication
  const sidebar = (
    <ReportSidebar
      features={features}
      reportCount={features.length}
      selectedId={selectedId}
      onSelect={handleSelect}
      onClose={handleClose}
      crisis={activeCrisis}
      crisisSelector={crisisSelector}
    />
  );

  return (
    // data-map-landing lets globals.css remove the shell's padding on this page only
    <div data-map-landing>
      {/* Skip link for keyboard users */}
      <a
        href="#report-list"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[200] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none"
      >
        {t("map.skip_to_list")}
      </a>

      {/*
        Map fills the full viewport area below the AppShell topbar (~3.5rem).
        Uses fixed inset-x-0 so the Leaflet map tiles fill edge-to-edge.
        The nav sidebar (z-10, fixed) renders on top at the start side.
      */}
      <div
        className="fixed inset-x-0"
        style={{ top: "var(--header-height)", bottom: 0 }}
      >
        <MapReporterView
          aria-label={t("reporter.map.interactive_label")}
          selectedId={selectedId}
          crisisId={selectedCrisisId}
          fitBounds={fitBounds}
          onSelectReport={handleSelect}
          onFeaturesLoaded={handleFeaturesLoaded}
          onReportCount={undefined}
          role="REPORTER"
        />
      </div>

      {/*
        Mobile: ReportSidebar renders its own fixed BottomSheet — no wrapper needed.
        CrisisSelector is placed above it in the DOM (fixed-positioned above sheet).
        Desktop: panel is positioned inside a width-animating container aligned
        with the nav sidebar edge. Hidden on mobile via md:fixed.
      */}
      {navSidebarMobile ? (
        sidebar
      ) : (
        <div
          data-testid="report-sidebar"
          className="fixed inset-y-0 z-20 transition-[left] duration-200 ease-linear"
          style={{ top: "var(--header-height)", bottom: 0, left: reportPanelLeft }}
        >
          {/* Width-animating container — collapses to w-0, not a strip */}
          <div
            className={cn(
              "h-full overflow-hidden transition-[width] duration-200 ease-linear",
              sidebarCollapsed ? "w-0" : "w-72 sm:w-80",
            )}
          >
            <div className="flex h-full flex-col">
              {sidebar}
            </div>
          </div>
          {/* Rail — sibling to overflow-hidden so it is never clipped.
            Hover shows a 2px highlight line, matching SidebarRail behaviour. */}
          <button
            type="button"
            tabIndex={-1}
            onClick={handleToggle}
            aria-label={
              sidebarCollapsed
                ? t("reporter.map.expand_sidebar")
                : t("reporter.map.collapse_sidebar")
            }
            className={cn(
              "absolute inset-y-0 -right-4 z-20 hidden w-4 -translate-x-1/2 sm:flex",
              "after:absolute after:inset-y-0 after:left-1/2 after:w-[2px]",
              "hover:after:bg-sidebar-border transition-all ease-linear duration-200",
              sidebarCollapsed ? "cursor-e-resize" : "cursor-w-resize",
            )}
          />
        </div>
      )}
      <div aria-hidden="true" style={{ height: "calc(100dvh - var(--header-height))" }} />

      {/* FAB: Report Damage */}
      <Button
        asChild
        size="icon"
        className="fixed bottom-6 end-4 z-[95] size-14 rounded-full shadow-xl"
        aria-label={t("reporter.actions.new_report")}
      >
        <Link href="/report">
          <Plus aria-hidden="true" className="size-6" />
        </Link>
      </Button>
    </div>
  );
}
