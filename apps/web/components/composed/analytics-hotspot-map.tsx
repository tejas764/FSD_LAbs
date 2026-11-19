"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import L from "leaflet";
import { Plus, Minus } from "lucide-react";
import { CircleMarker, MapContainer, TileLayer, Tooltip as LeafletTooltip, useMap } from "react-leaflet";
import { useTranslation } from "react-i18next";
import "leaflet/dist/leaflet.css";
import { STREET_TILE_URL, STREET_TILE_ATTRIBUTION, STREET_TILE_MAX_ZOOM } from "@/lib/map-tiles";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Hotspot = {
    h3Index: string;
    centerLat: number;
    centerLng: number;
    count: number;
    avgDamageLevel: number;
};

function FitToHotspots({ hotspots }: { hotspots: Hotspot[] }) {
    const map = useMap();

    useEffect(() => {
        if (hotspots.length === 0) return;

        if (hotspots.length === 1) {
            map.setView([hotspots[0].centerLat, hotspots[0].centerLng], 8);
            return;
        }

        const bounds = L.latLngBounds(hotspots.map((spot) => [spot.centerLat, spot.centerLng] as [number, number]));
        map.fitBounds(bounds.pad(0.25));
    }, [hotspots, map]);

    return null;
}

function hotspotColor(avgDamageLevel: number): string {
    if (avgDamageLevel >= 2.5) return "var(--color-damage-complete, #dc2626)";
    if (avgDamageLevel >= 1.5) return "var(--color-damage-partial, #d97706)";
    return "var(--color-damage-minimal, #16a34a)";
}

function hotspotRadius(count: number): number {
    return Math.max(12, Math.min(32, 10 + Math.log2(Math.max(count, 1)) * 4));
}

function MapZoomControl() {
    const { t } = useTranslation();
    const map = useMap();
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
    }, []);

    const container = map.getContainer().querySelector(".leaflet-top.leaflet-right");
    if (!container) return null;

    return createPortal(
        <div ref={containerRef} className="leaflet-control map-zoom-group">
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="map-control-btn"
                        aria-label={t("reporter.map.zoom_in")}
                        onClick={() => map.zoomIn()}
                    >
                        <Plus aria-hidden="true" className="size-4" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="left">{t("reporter.map.zoom_in")}</TooltipContent>
            </Tooltip>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="map-control-btn"
                        aria-label={t("reporter.map.zoom_out")}
                        onClick={() => map.zoomOut()}
                    >
                        <Minus aria-hidden="true" className="size-4" />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="left">{t("reporter.map.zoom_out")}</TooltipContent>
            </Tooltip>
        </div>,
        container,
    );
}

export function AnalyticsHotspotMap({
    hotspots,
    selectedHotspotId,
    onSelectHotspot,
    ariaLabel,
    className,
}: {
    hotspots: Hotspot[];
    selectedHotspotId: string | null;
    onSelectHotspot: (id: string) => void;
    ariaLabel: string;
    className?: string;
}) {
    const center = useMemo<[number, number]>(() => {
        if (hotspots.length === 0) return [20, 0];
        const [first] = hotspots;
        return [first.centerLat, first.centerLng];
    }, [hotspots]);

    return (
        <TooltipProvider>
            <div className={cn("relative z-0 overflow-hidden rounded-md border border-border", className)}>
                <MapContainer
                    center={center}
                    zoom={3}
                    scrollWheelZoom
                    zoomControl={false}
                    className="z-0 h-full min-h-[320px] w-full"
                    aria-label={ariaLabel}
                >
                    <TileLayer
                        attribution={STREET_TILE_ATTRIBUTION}
                        url={STREET_TILE_URL}
                        maxZoom={STREET_TILE_MAX_ZOOM}
                    />
                    <MapZoomControl />
                    <FitToHotspots hotspots={hotspots} />
                    {hotspots.map((spot) => (
                        <CircleMarker
                            key={spot.h3Index}
                            center={[spot.centerLat, spot.centerLng]}
                            radius={hotspotRadius(spot.count)}
                            pathOptions={{
                                color: hotspotColor(spot.avgDamageLevel),
                                fillColor: hotspotColor(spot.avgDamageLevel),
                                fillOpacity: spot.h3Index === selectedHotspotId ? 0.7 : 0.4,
                                weight: spot.h3Index === selectedHotspotId ? 3 : 1.5,
                            }}
                            eventHandlers={{ click: () => onSelectHotspot(spot.h3Index) }}
                        >
                            <LeafletTooltip>
                                {spot.h3Index} · {spot.count}
                            </LeafletTooltip>
                        </CircleMarker>
                    ))}
                </MapContainer>
            </div>
        </TooltipProvider>
    );
}
