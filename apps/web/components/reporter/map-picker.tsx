"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface MapPickerProps {
  onSelect: (coords: Coordinates | null) => void;
  initialCoordinates?: Coordinates | null;
}

// Leaflet must not run on the server — SSR disabled, grey placeholder shown while loading.
const LeafletMap = dynamic(() => import("./leaflet-map"), { ssr: false });

export function MapPicker({
  onSelect,
  initialCoordinates = null,
}: MapPickerProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const descId = useId();
  const initialValue = initialCoordinates
    ? `${initialCoordinates.lat.toFixed(6)}, ${initialCoordinates.lon.toFixed(6)}`
    : "";
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [mapCoords, setMapCoords] = useState<Coordinates | null>(
    initialCoordinates,
  );
  const [locating, setLocating] = useState(false);

  function handleMapSelect(coords: Coordinates) {
    setValue(`${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
    setError(null);
    setMapCoords(coords);
    onSelect(coords);
  }

  function isValidLatitude(lat: number): boolean {
    return lat >= -90 && lat <= 90;
  }

  function isValidLongitude(lon: number): boolean {
    return lon >= -180 && lon <= 180;
  }

  function validateInput(inputText: string): Coordinates | null {
    const parts = inputText.split(",").map((s) => s.trim());
    if (parts.length !== 2) return null;
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lon)) return null;
    if (!isValidLatitude(lat) || !isValidLongitude(lon)) return null;
    return { lat, lon };
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newValue = e.target.value;
    setValue(newValue);

    // Validate on every keystroke
    const coords = validateInput(newValue);
    if (coords) {
      setMapCoords(coords); // Update map view
      onSelect(coords); // Valid coordinates
    } else if (newValue.trim()) {
      onSelect(null); // Invalid input - clear previous coordinates
    }
  }

  function handleLocateMe() {
    if (!navigator.geolocation) {
      const msg = t("map.error_geolocation_unsupported");
      setError(msg); toast.error(msg);
      return;
    }

    setLocating(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        };
        setValue(`${coords.lat.toFixed(6)}, ${coords.lon.toFixed(6)}`);
        setMapCoords(coords);
        onSelect(coords);
        setLocating(false);
      },
      (err) => {
        const msg = err.message || t("map.error_geolocation_failed");
        setError(msg); toast.error(msg);
        setLocating(false);
      },
      { timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    const parts = value.split(",").map((s) => s.trim());
    if (parts.length !== 2) {
      const msg = t("map.error_invalid_format");
      setError(msg); toast.error(msg);
      return;
    }
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lon)) {
      const msg = t("map.error_invalid_numbers");
      setError(msg); toast.error(msg);
      return;
    }
    if (!isValidLatitude(lat)) {
      const msg = t("map.error_latitude_range");
      setError(msg); toast.error(msg);
      return;
    }
    if (!isValidLongitude(lon)) {
      const msg = t("map.error_longitude_range");
      setError(msg); toast.error(msg);
      return;
    }
    setError(null);
    onSelect({ lat, lon });
  }

  return (
    <div
      role="application"
      aria-label={t("map.aria_label")}
      aria-describedby={descId}
    >
      <p id={descId} className="sr-only">{t("map.keyboard_instructions")}</p>
      {/* Grey background shows while Leaflet JS loads.
          `relative isolate` creates a new stacking context so Leaflet's
          internal z-indexes (tiles: 200, controls: 1000) do not escape to
          compete with the fixed bottom-nav (--z-sticky: 100). */}
      <div
        data-testid="map-container"
        className="relative isolate"
        style={{ width: "100%", height: "300px", background: "#e5e7eb" }}
      >
        <LeafletMap
          onSelect={handleMapSelect}
          initialCoordinates={initialCoordinates}
          targetCoordinates={mapCoords}
        />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-foreground"
          >
            {t("map.coordinates_label")}
          </label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("map.coordinates_format_info")}
                  className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                >
                  <HelpCircle aria-hidden="true" className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{t("map.coordinates_format_tooltip")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <div className="relative">
          <Input
            id={inputId}
            type="text"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t("map.coordinates_placeholder")}
            className="pe-10"
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleLocateMe}
                  disabled={locating}
                  aria-label={t("map.locate_me")}
                  className={cn(
                    "absolute end-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground",
                    locating && "opacity-50",
                  )}
                >
                  <Crosshair
                    className={cn("size-3.5", locating && "animate-pulse")}
                    aria-hidden="true"
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{t("map.locate_me")}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {error && (
          <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
