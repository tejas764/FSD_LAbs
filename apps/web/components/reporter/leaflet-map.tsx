"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { STREET_TILE_URL, STREET_TILE_ATTRIBUTION, STREET_TILE_MAX_ZOOM } from "@/lib/map-tiles";
import L from "leaflet";
import type { Coordinates } from "./map-picker";

// SVG-based marker icon that looks like a proper location pin
const pinIcon = new L.DivIcon({
  html: `<svg width="32" height="40" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 0C8.268 0 2 6.268 2 14c0 8.5 14 26 14 26s14-17.5 14-26c0-7.732-6.268-14-14-14z" fill="#009EDB"/>
    <circle cx="16" cy="14" r="5" fill="white"/>
  </svg>`,
  iconSize: [32, 40],
  iconAnchor: [16, 40],
  popupAnchor: [0, -40],
  className: "",
});

function ClickHandler({
  onSelect,
}: {
  onSelect: (coords: Coordinates) => void;
}) {
  useMapEvents({
    click(e) {
      onSelect({ lat: e.latlng.lat, lon: e.latlng.lng });
    },
  });
  return null;
}

function GeolocateOnLoad({
  onLocate,
  hasInitialCoords,
  userHasInteracted,
}: {
  onLocate: (coords: Coordinates) => void;
  hasInitialCoords: boolean;
  userHasInteracted: boolean;
}) {
  const map = useMap();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    // Skip geolocation if initial coordinates already provided or user has manually selected location
    if (hasInitialCoords || userHasInteracted) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!mountedRef.current) return;
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        try {
          map.flyTo([coords.lat, coords.lon], 15);
        } catch {
          // map may have been removed from DOM before geolocation resolved
        }
        onLocate(coords);
      },
      // Silently stay at world view on denial / timeout
      () => { },
      { timeout: 10_000, maximumAge: 60_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, hasInitialCoords, userHasInteracted]);

  return null;
}

function FlyToCoordinates({ coords }: { coords: Coordinates | null }) {
  const map = useMap();

  useEffect(() => {
    if (coords) {
      map.flyTo([coords.lat, coords.lon], 15, { duration: 0.5 });
    }
  }, [coords, map]);

  return null;
}

interface DraggableMarkerProps {
  position: Coordinates;
  onDragEnd: (coords: Coordinates) => void;
}

function DraggableMarker({ position, onDragEnd }: DraggableMarkerProps) {
  const markerRef = useRef<L.Marker>(null);

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          onDragEnd({ lat: latLng.lat, lon: latLng.lng });
        }
      },
    }),
    [onDragEnd],
  );

  return (
    <Marker
      draggable
      eventHandlers={eventHandlers}
      position={[position.lat, position.lon]}
      icon={pinIcon}
      ref={markerRef}
    />
  );
}

interface LeafletMapProps {
  onSelect: (coords: Coordinates) => void;
  initialCoordinates?: Coordinates | null;
  targetCoordinates?: Coordinates | null;
}

export default function LeafletMap({
  onSelect,
  initialCoordinates = null,
  targetCoordinates = null,
}: LeafletMapProps) {
  const [selected, setSelected] = useState<Coordinates | null>(
    initialCoordinates,
  );
  const userHasInteracted =
    selected !== null || targetCoordinates !== null || !!initialCoordinates;
  const markerPosition = targetCoordinates ?? selected;

  const handleSelect = useCallback(
    (coords: Coordinates) => {
      setSelected(coords);
      onSelect(coords);
    },
    [onSelect],
  );

  const initialCenter: [number, number] = initialCoordinates
    ? [initialCoordinates.lat, initialCoordinates.lon]
    : [20, 0];
  const initialZoom = initialCoordinates ? 15 : 2;

  return (
    <div data-testid="map-surface" style={{ width: "100%", height: "100%" }}>
      <MapContainer
        center={initialCenter}
        zoom={initialZoom}
        style={{ width: "100%", height: "100%" }}
        attributionControl
      >
        {/* Request only the street tiles visible in this viewport. */}
        <TileLayer
          attribution={STREET_TILE_ATTRIBUTION}
          url={STREET_TILE_URL}
          maxZoom={STREET_TILE_MAX_ZOOM}
        />
        <ClickHandler onSelect={handleSelect} />
        <GeolocateOnLoad
          onLocate={handleSelect}
          hasInitialCoords={!!initialCoordinates}
          userHasInteracted={userHasInteracted}
        />
        <FlyToCoordinates coords={targetCoordinates} />
        {markerPosition && (
          <DraggableMarker position={markerPosition} onDragEnd={handleSelect} />
        )}
      </MapContainer>
    </div>
  );
}
