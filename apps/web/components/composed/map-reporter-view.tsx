"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient, type DamageLevel } from "@/lib/api/client";
import { MapLegend } from "@/components/map/map-legend";
import { useConnectivity } from "@/lib/offline/connectivity";
import type { ReportMapFeature } from "./leaflet-report-map";

const LeafletReportMap = dynamic(
  () =>
    import("./leaflet-report-map").then((m) => ({
      default: m.LeafletReportMap,
    })),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="h-full w-full rounded-none" />
    ),
  },
);

interface MapReporterViewProps {
  "aria-label": string;
  selectedId?: string | null;
  crisisId?: string | null;
  damageFilter?: "all" | DamageLevel;
  dateFrom?: string;
  dateTo?: string;
  fitBounds?: [number, number, number, number] | null;
  onReportCount?: (count: number) => void;
  onSelectReport?: (id: string) => void;
  onFeaturesLoaded?: (features: ReportMapFeature[]) => void;
  /** Called after each fetch with the total matching count in the area (may exceed the loaded features count when truncated) */
  onMetaLoaded?: (meta: { total: number; truncated: boolean }) => void;
  onExportComplete?: (url: string) => void;
  onLiveStatusChange?: (isLive: boolean) => void;
  role?: string;
  /** Override legend wrapper positioning classes. Defaults to bottom-right above FAB. */
  legendClassName?: string;
}

export function MapReporterView({
  "aria-label": ariaLabel,
  selectedId,
  crisisId,
  damageFilter = "all",
  dateFrom,
  dateTo,
  fitBounds,
  onReportCount,
  onSelectReport,
  onFeaturesLoaded,
  onMetaLoaded,
  onLiveStatusChange,
  role,
  legendClassName = "bottom-[88px] end-4",
}: MapReporterViewProps) {
  const { t } = useTranslation();
  const { isOnline } = useConnectivity();
  const [features, setFeatures] = useState<ReportMapFeature[]>([]);
  const [isStale, setIsStale] = useState(false);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the latest viewport bounds so we can re-fetch when crisisId changes
  // without waiting for the user to move/zoom the map.
  const boundsRef = useRef<string>("");

  const notifyFeatures = useCallback(
    (newFeatures: ReportMapFeature[], meta?: { total: number; nextCursor: string | null }) => {
      setFeatures(newFeatures);
      onReportCount?.(newFeatures.length);
      onFeaturesLoaded?.(newFeatures);
      if (meta !== undefined) {
        onMetaLoaded?.({ total: meta.total, truncated: meta.nextCursor !== null });
      }
    },
    [onReportCount, onFeaturesLoaded, onMetaLoaded],
  );

  // Debounced fetch: extract API call so both the bounds-change handler and the
  // crisisId-change effect share the same implementation.
  const fetchReports = useCallback(
    (bounds: string) => {
      if (!bounds.trim()) {
        return;
      }
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = setTimeout(() => {
        void (async () => {
          try {
            const res = await apiClient.reports.list({
              bounds,
              ...(crisisId ? { crisisId } : {}),
              ...(damageFilter !== "all" ? { damageLevel: damageFilter } : {}),
              ...(dateFrom ? { dateFrom } : {}),
              ...(dateTo ? { dateTo } : {}),
            });
            const allFeatures: ReportMapFeature[] = [];
            for (const f of res.features) {
              if (f.geometry === null) continue;
              allFeatures.push({
                id: f.id,
                lat: f.geometry.coordinates[1],
                lng: f.geometry.coordinates[0],
                damageLevel: f.properties.damageLevel,
                submittedAt: f.properties.submittedAt,
                moderationStatus: f.properties.moderationStatus ?? null,
                isDuplicate: f.properties.isDuplicate,
                version: f.properties.version,
                infraType: f.properties.infraType ?? undefined,
                infraName: f.properties.infraName ?? null,
                crisisType: f.properties.crisisType ?? undefined,
                locationText: f.properties.locationText ?? null,
              });
            }
            notifyFeatures(allFeatures, res.meta);
            setIsStale(false);
          } catch {
            setIsStale(true);
          }
        })();
      }, 500);
    },
    [notifyFeatures, crisisId, damageFilter, dateFrom, dateTo, isOnline],
  );

  useEffect(() => {
    return () => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
      }
    };
  }, []);

  // Track last-known bounds so that when crisisId changes we can immediately
  // re-fetch without waiting for the next map moveend/zoomend event.
  const handleBoundsChange = useCallback(
    (bounds: string) => {
      boundsRef.current = bounds.trim();
      fetchReports(bounds);
    },
    [fetchReports],
  );

  // When the active crisis changes (including clearing to "all"), immediately
  // re-issue the fetch with the current viewport bounds.  fetchReports changes
  // identity whenever crisisId changes, so this effect fires at the right time.
  useEffect(() => {
    if (boundsRef.current) {
      fetchReports(boundsRef.current);
    }
  }, [fetchReports]);

  // SSE real-time subscription.
  // - Reporters (anonymous) use the unauthenticated public stream.
  // - Analysts/admins use the cookie-authenticated stream (also receives export.complete).
  // Both paths notify the parent of live status via onLiveStatusChange.
  useEffect(() => {
    if (!crisisId || !isOnline) { onLiveStatusChange?.(false); return; }

    const stream =
      role === "REPORTER"
        ? apiClient.reports.publicStream(crisisId)
        : apiClient.reports.stream(crisisId);

    const handleUpdate = () => {
      if (boundsRef.current) {
        fetchReports(boundsRef.current);
      }
    };

    const handleReady = () => onLiveStatusChange?.(true);
    const handleError = () => onLiveStatusChange?.(false);

    stream.addEventListener("report.updated", handleUpdate);
    stream.addEventListener("ready", handleReady);
    stream.addEventListener("error", handleError);

    return () => {
      stream.removeEventListener("report.updated", handleUpdate);
      stream.removeEventListener("ready", handleReady);
      stream.removeEventListener("error", handleError);
      stream.close();
      onLiveStatusChange?.(false);
    };
  }, [crisisId, role, fetchReports, onLiveStatusChange, isOnline]);

  return (
    <div className="relative h-full w-full" role="region" aria-label={ariaLabel}>
      {isStale && (
        <div
          role="status"
          aria-live="polite"
          className="absolute start-2 top-2 z-[201] rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground"
        >
          {t("reporter.map.data_stale")}
        </div>
      )}
      <LeafletReportMap
        features={features}
        selectedId={selectedId}
        onSelectReport={onSelectReport}
        onBoundsChange={handleBoundsChange}
        fitBounds={fitBounds}
      />
      {/* Map legend */}
      <div className={`absolute ${legendClassName} z-[400] pointer-events-none`}>
        <MapLegend />
      </div>
    </div>
  );
}

