// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockMap = {
    getContainer: () => ({
        querySelector: (_sel: string) => {
            const el = document.createElement("div");
            el.className = "leaflet-top leaflet-right";
            return el;
        },
    }),
    setView: vi.fn(),
    fitBounds: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
};

vi.mock("react-leaflet", () => ({
    MapContainer: ({
        children,
        zoomControl,
        className,
    }: {
        children: React.ReactNode;
        zoomControl?: boolean;
        className?: string;
    }) => (
        <div data-testid="map-container" data-zoom-control={String(zoomControl)} className={className}>
            {children}
        </div>
    ),
    TileLayer: () => <div data-testid="tile-layer" />,
    CircleMarker: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    useMap: () => mockMap,
}));

vi.mock("leaflet", () => ({
    default: {
        latLngBounds: vi.fn(() => ({
            pad: vi.fn(),
        })),
        DomEvent: {
            disableClickPropagation: vi.fn(),
            disableScrollPropagation: vi.fn(),
        },
    },
}));

vi.mock("leaflet/dist/leaflet.css", () => ({}));

vi.mock("react-dom", async (importOriginal) => {
    const original = await importOriginal<typeof import("react-dom")>();
    return {
        ...original,
        createPortal: (children: React.ReactNode) => children,
    };
});

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

import { AnalyticsHotspotMap } from "./analytics-hotspot-map";

describe("AnalyticsHotspotMap — zoom control parity", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses custom zoom controls matching report map", () => {
        render(
            <AnalyticsHotspotMap
                hotspots={[]}
                selectedHotspotId={null}
                onSelectHotspot={vi.fn()}
                ariaLabel="dashboard.analytics.map_region_label"
            />,
        );

        expect(screen.getByRole("button", { name: "reporter.map.zoom_in" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "reporter.map.zoom_out" })).toBeInTheDocument();
    });

    it("disables default Leaflet zoom control", () => {
        render(
            <AnalyticsHotspotMap
                hotspots={[]}
                selectedHotspotId={null}
                onSelectHotspot={vi.fn()}
                ariaLabel="dashboard.analytics.map_region_label"
            />,
        );

        expect(screen.getByTestId("map-container")).toHaveAttribute("data-zoom-control", "false");
    });

    it("wires zoom buttons to map zoom methods", async () => {
        const user = userEvent.setup();
        render(
            <AnalyticsHotspotMap
                hotspots={[]}
                selectedHotspotId={null}
                onSelectHotspot={vi.fn()}
                ariaLabel="dashboard.analytics.map_region_label"
            />,
        );

        await user.click(screen.getByRole("button", { name: "reporter.map.zoom_in" }));
        await user.click(screen.getByRole("button", { name: "reporter.map.zoom_out" }));

        expect(mockMap.zoomIn).toHaveBeenCalledTimes(1);
        expect(mockMap.zoomOut).toHaveBeenCalledTimes(1);
    });
});
