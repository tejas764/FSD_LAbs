"use client";

import { useEffect, useRef, useState } from "react";
import {
    MapContainer, TileLayer, Marker, Popup,
    useMap, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";
import { STREET_TILE_URL, STREET_TILE_ATTRIBUTION, STREET_TILE_MAX_ZOOM } from "@/lib/map-tiles";
import { useTranslation } from "react-i18next";
import { Crosshair, Layers, Maximize, Minimize, Minus, Plus, X as XIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { ReportDetailContent } from "@/components/composed/report-detail-popover";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── resize invalidator ──────────────────────────────────────────────────────

/**
 * Calls map.invalidateSize() whenever the Leaflet container element is resized
 * (e.g. when a flex/grid parent changes proportions on mobile layout shifts).
 */
function MapSizeInvalidator() {
    const map = useMap();
    useEffect(() => {
        const container = map.getContainer();
        const observer = new ResizeObserver(() => {
            map.invalidateSize();
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, [map]);
    return null;
}

// ─── damage level constants ───────────────────────────────────────────────────

const DAMAGE_COLORS: Record<string, string> = {
    MINIMAL: "#22c55e",
    PARTIAL: "#f59e0b",
    COMPLETE: "#ef4444",
};

// ─── tile layer definitions ───────────────────────────────────────────────────

export type MapLayer = "streets" | "satellite";

const TILE_LAYERS: Record<MapLayer, { url: string; attribution: string; maxZoom: number; subdomains?: string }> = {
    streets: {
        url: STREET_TILE_URL,
        attribution: STREET_TILE_ATTRIBUTION,
        maxZoom: STREET_TILE_MAX_ZOOM,
    },
    satellite: {
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        maxZoom: 18,
    },
};

// ─── pin icon ─────────────────────────────────────────────────────────────────

function createPinIcon(color: string, isSelected: boolean): L.DivIcon {
    const w = isSelected ? 22 : 16;
    const h = isSelected ? 31 : 22;
    const extraClass = isSelected ? " report-pin-icon--selected" : "";
    const html = `<svg class="report-pin-icon${extraClass}" viewBox="0 0 20 28" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10 1C5.03 1 1 5.03 1 10c0 7.5 9 17 9 17s9-9.5 9-17c0-4.97-4.03-9-9-9z" fill="${color}" stroke="white" stroke-width="1.5"/><circle cx="10" cy="10" r="3" fill="rgba(255,255,255,0.5)"/></svg>`;
    return L.divIcon({ html, className: "", iconSize: [w, h], iconAnchor: [w / 2, h] });
}

function createLocateDotIcon(): L.DivIcon {
    const html = `<div style="width:14px;height:14px;border-radius:50%;background:#2563eb;border:2.5px solid white;box-shadow:0 0 0 3px rgba(37,99,235,0.25)"></div>`;
    return L.divIcon({ html, className: "", iconSize: [14, 14], iconAnchor: [7, 7] });
}

// ─── popup content ────────────────────────────────────────────────────────────

function MapPopupContent({ reportId }: { reportId: string }) {
    const { t } = useTranslation();
    const map = useMap();

    return (
        <div className="popup-body w-[272px] overflow-hidden" role="region" aria-label={t("report_detail.title")}>
            <button
                type="button"
                onClick={() => map.closePopup()}
                aria-label={t("map.close_detail")}
                className="absolute end-2 top-2 z-10 flex size-7 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
                <XIcon aria-hidden="true" className="size-3.5" />
            </button>
            <ReportDetailContent reportId={reportId} />
        </div>
    );
}

// ─── layer switcher control ───────────────────────────────────────────────────

function MapLayerControl({ layer, onLayerChange }: {
    layer: MapLayer;
    onLayerChange: (l: MapLayer) => void;
}) {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const map = useMap();

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        L.DomEvent.disableClickPropagation(el);
        L.DomEvent.disableScrollPropagation(el);
    }, []);

    const container = map.getContainer().querySelector(".leaflet-top.leaflet-right");
    if (!container) return null;

    return createPortal(
        <div
            ref={containerRef}
            className="leaflet-control map-control-cluster-item map-control-cluster-start"
            style={{ position: "relative" }}
        >
            <DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                className="map-control-btn"
                                aria-label={t("reporter.map.layer_switcher_label")}
                            >
                                <Layers aria-hidden="true" style={{ width: "1rem", height: "1rem" }} />
                            </button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                        {t("reporter.map.layer_switcher_label")}
                    </TooltipContent>
                </Tooltip>
                <DropdownMenuContent side="left" align="start" className="w-32">
                    <DropdownMenuRadioGroup
                        value={layer}
                        onValueChange={(v) => onLayerChange(v as MapLayer)}
                    >
                        <DropdownMenuRadioItem value="streets">
                            {t("reporter.map.layer_default")}
                        </DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="satellite">
                            {t("reporter.map.layer_satellite")}
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>,
        container,
    );
}

// ─── fullscreen control ───────────────────────────────────────────────────────

function MapFullscreenControl() {
    const { t } = useTranslation();
    const map = useMap();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        L.DomEvent.disableClickPropagation(el);
    }, []);

    useEffect(() => {
        function onFsChange() {
            setIsFullscreen(!!document.fullscreenElement);
        }
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    function toggle() {
        const el = map.getContainer();
        if (!document.fullscreenElement) {
            void el.requestFullscreen();
        } else {
            void document.exitFullscreen();
        }
    }

    const label = isFullscreen ? t("reporter.map.fullscreen_exit") : t("reporter.map.fullscreen_enter");

    const container = map.getContainer().querySelector(".leaflet-top.leaflet-right");
    if (!container) return null;

    return createPortal(
        <div ref={containerRef} className="leaflet-control map-control-cluster-item map-control-cluster-middle">
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="map-control-btn"
                        aria-label={label}
                        aria-pressed={isFullscreen}
                        onClick={toggle}
                    >
                        {isFullscreen
                            ? <Minimize aria-hidden="true" style={{ width: "1rem", height: "1rem" }} />
                            : <Maximize aria-hidden="true" style={{ width: "1rem", height: "1rem" }} />
                        }
                    </button>
                </TooltipTrigger>
                <TooltipContent side="left">{label}</TooltipContent>
            </Tooltip>
        </div>,
        container,
    );
}

// ─── locate control ───────────────────────────────────────────────────────────

type LocateState = "idle" | "acquiring" | "active" | "error";

function MapLocateControl() {
    const { t } = useTranslation();
    const map = useMap();
    const [state, setState] = useState<LocateState>("idle");
    const markerRef = useRef<L.Marker | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        L.DomEvent.disableClickPropagation(el);
    }, []);

    // Clean up watcher on unmount
    useEffect(() => {
        return () => {
            if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
            markerRef.current?.remove();
        };
    }, []);

    function stopTracking() {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        markerRef.current?.remove();
        markerRef.current = null;
        setState("idle");
    }

    function startTracking() {
        if (!navigator.geolocation) { setState("error"); return; }
        setState("acquiring");
        watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude: lat, longitude: lng } = pos.coords;
                setState("active");
                if (markerRef.current) {
                    markerRef.current.setLatLng([lat, lng]);
                } else {
                    markerRef.current = L.marker([lat, lng], { icon: createLocateDotIcon(), zIndexOffset: 500 }).addTo(map);
                }
                map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: true });
            },
            () => { setState("error"); stopTracking(); },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    }

    function handleClick() {
        if (state === "active" || state === "acquiring") {
            stopTracking();
        } else {
            startTracking();
        }
    }

    const label =
        state === "acquiring" ? t("reporter.map.locate_acquiring") :
            state === "error" ? t("reporter.map.locate_error") :
                t("reporter.map.locate_me");

    const container = map.getContainer().querySelector(".leaflet-top.leaflet-right");
    if (!container) return null;

    return createPortal(
        <div ref={containerRef} className="leaflet-control map-control-cluster-item map-control-cluster-end">
            <Tooltip>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        className="map-control-btn"
                        aria-label={label}
                        aria-pressed={state === "active"}
                        data-active={state === "active" ? "true" : undefined}
                        onClick={handleClick}
                    >
                        <Crosshair
                            aria-hidden="true"
                            style={{
                                width: "1rem",
                                height: "1rem",
                                animation: state === "acquiring" ? "report-pin-pulse 1s ease-in-out infinite" : undefined,
                            }}
                        />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="left">{label}</TooltipContent>
            </Tooltip>
        </div>,
        container,
    );
}

// ─── zoom control ──────────────────────────────────────────────────────────────

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
                        <Plus aria-hidden="true" style={{ width: "1rem", height: "1rem" }} />
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
                        <Minus aria-hidden="true" style={{ width: "1rem", height: "1rem" }} />
                    </button>
                </TooltipTrigger>
                <TooltipContent side="left">{t("reporter.map.zoom_out")}</TooltipContent>
            </Tooltip>
        </div>,
        container,
    );
}

// ─── exported types ───────────────────────────────────────────────────────────

export interface ReportMapFeature {
    id: string;
    lat: number;
    lng: number;
    damageLevel: string;
    submittedAt: string;
    moderationStatus: string | null;
    isDuplicate: boolean;
    version: number;
    infraType?: string;
    infraName?: string | null;
    crisisType?: string;
    locationText?: string | null;
}

interface LeafletReportMapProps {
    features: ReportMapFeature[];
    selectedId?: string | null;
    onSelectReport?: (id: string) => void;
    onBoundsChange?: (bounds: string) => void;
    /** When set, the map immediately fits to these bounds: [south, west, north, east] */
    fitBounds?: [number, number, number, number] | null;
}

// ─── internal map helpers ─────────────────────────────────────────────────────

function FitBoundsHandler({ fitBounds }: { fitBounds?: [number, number, number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        if (!fitBounds) return;
        const [south, west, north, east] = fitBounds;
        map.fitBounds([[south, west], [north, east]], { padding: [40, 40], animate: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitBounds]);
    return null;
}

function MoveEndHandler({ onBoundsChange }: { onBoundsChange?: (bounds: string) => void }) {
    const map = useMapEvents({
        moveend: () => emitBounds(map, onBoundsChange),
        zoomend: () => emitBounds(map, onBoundsChange),
    });
    useEffect(() => {
        emitBounds(map, onBoundsChange);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map]);
    return null;
}

function emitBounds(map: LeafletMap, cb?: (b: string) => void) {
    const b = map.getBounds();
    if (!b.isValid()) return;
    cb?.(`${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`);
}

/**
 * Pans to the selected marker only when selectedId changes.
 * Using useEffect prevents the render→pan→moveend→fetch loop.
 */
function PanToSelected({
    features,
    selectedId,
    markerRefs,
}: {
    features: ReportMapFeature[];
    selectedId: string | null | undefined;
    markerRefs: React.RefObject<Map<string, L.Marker>>;
}) {
    const map = useMap();
    useEffect(() => {
        if (!selectedId) return;
        const f = features.find((x) => x.id === selectedId);
        if (f) {
            map.panTo([f.lat, f.lng], { animate: true });
            // Open the popup after a short delay to allow pan to start
            const marker = markerRefs.current?.get(selectedId);
            if (marker) setTimeout(() => marker.openPopup(), 80);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);
    return null;
}

// ─── map component ────────────────────────────────────────────────────────────

export function LeafletReportMap({
    features,
    selectedId,
    onSelectReport,
    onBoundsChange,
    fitBounds,
}: LeafletReportMapProps) {
    const markerRefs = useRef<Map<string, L.Marker>>(new Map());
    const [layer, setLayer] = useState<MapLayer>("streets");
    const tileConfig = TILE_LAYERS[layer];

    return (
        <TooltipProvider>
            <div data-layer={layer} className="h-full w-full">
                <MapContainer
                    center={[20, 0]}
                    zoom={2}
                    className="h-full w-full"
                    attributionControl={true}
                    zoomControl={false}
                >
                    <TileLayer
                        key={layer}
                        url={tileConfig.url}
                        attribution={tileConfig.attribution}
                        subdomains={tileConfig.subdomains ?? ""}
                        maxZoom={tileConfig.maxZoom}
                    />
                    <MapLayerControl layer={layer} onLayerChange={setLayer} />
                    <MapFullscreenControl />
                    <MapLocateControl />
                    <MapZoomControl />
                    <MapSizeInvalidator />
                    <MoveEndHandler onBoundsChange={onBoundsChange} />
                    <FitBoundsHandler fitBounds={fitBounds} />
                    <PanToSelected features={features} selectedId={selectedId} markerRefs={markerRefs} />
                    {features.map((f) => {
                        const isSelected = f.id === selectedId;
                        const color = DAMAGE_COLORS[f.damageLevel] ?? "#6b7280";
                        return (
                            <Marker
                                key={f.id}
                                position={[f.lat, f.lng]}
                                icon={createPinIcon(color, isSelected)}
                                ref={(m) => {
                                    if (m) markerRefs.current.set(f.id, m);
                                    else markerRefs.current.delete(f.id);
                                }}
                                eventHandlers={{ click: () => onSelectReport?.(f.id) }}
                            >
                                <Popup
                                    className="report-map-popup"
                                    minWidth={248}
                                    maxWidth={272}
                                    closeButton={false}
                                >
                                    <MapPopupContent reportId={f.id} />
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>
            </div>
        </TooltipProvider>
    );
}
