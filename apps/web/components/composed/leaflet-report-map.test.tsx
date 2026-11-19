// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// ─── mocks ───────────────────────────────────────────────────────────────────

// Capture the tile URL rendered by TileLayer
let lastTileUrl = "";

const mockMap = {
    getContainer: () => ({
        querySelector: (_sel: string) => {
            const el = document.createElement("div");
            el.className = "leaflet-top leaflet-right";
            return el;
        },
        requestFullscreen: vi.fn().mockResolvedValue(undefined),
    }),
    getBounds: () => ({
        isValid: () => true,
        getSouth: () => -10,
        getWest: () => -10,
        getNorth: () => 10,
        getEast: () => 10,
    }),
    getZoom: () => 10,
    setView: vi.fn(),
    panTo: vi.fn(),
    fitBounds: vi.fn(),
    closePopup: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
};

vi.mock("react-leaflet", () => ({
    MapContainer: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="map-container">{children}</div>
    ),
    TileLayer: ({ url }: { url: string }) => {
        lastTileUrl = url;
        return <div data-testid="tile-layer" data-url={url} />;
    },
    Marker: () => null,
    Popup: () => null,
    useMap: () => mockMap,
    useMapEvents: () => mockMap,
}));

vi.mock("leaflet", () => ({
    default: {
        divIcon: () => ({}),
        marker: vi.fn().mockReturnValue({
            addTo: vi.fn().mockReturnThis(),
            remove: vi.fn(),
            setLatLng: vi.fn(),
            openPopup: vi.fn(),
        }),
        DomEvent: {
            disableClickPropagation: vi.fn(),
            disableScrollPropagation: vi.fn(),
        },
    },
}));

// Bypass leaflet CSS import
vi.mock("leaflet/dist/leaflet.css", () => ({}));

// Render portal children inline instead of teleporting to DOM node
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

vi.mock("@/components/composed/report-detail-popover", () => ({
    ReportDetailContent: () => <div data-testid="report-detail" />,
}));

// ─── imports after mocks ──────────────────────────────────────────────────────

import { LeafletReportMap } from "./leaflet-report-map";

// ─── tests ───────────────────────────────────────────────────────────────────

describe("LeafletReportMap — tile layer selection", () => {
    beforeEach(() => {
        lastTileUrl = "";
        vi.clearAllMocks();
    });

    it("defaults to the public OpenStreetMap street tile URL", () => {
        render(<LeafletReportMap features={[]} />);
        expect(lastTileUrl).toBe("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    });

    it("has no dark tile variant (dark option removed)", () => {
        render(<LeafletReportMap features={[]} />);
        expect(lastTileUrl).not.toContain("dark_matter");
    });
});

describe("LeafletReportMap — layer switcher control", () => {
    beforeEach(() => {
        lastTileUrl = "";
        vi.clearAllMocks();
    });

    it("renders layer switcher button with correct aria-label", () => {
        render(<LeafletReportMap features={[]} />);
        expect(
            screen.getByRole("button", { name: "reporter.map.layer_switcher_label" }),
        ).toBeInTheDocument();
    });

    it("opens layer panel with Default and Satellite options only", async () => {
        const user = userEvent.setup();
        render(<LeafletReportMap features={[]} />);
        await user.click(screen.getByRole("button", { name: "reporter.map.layer_switcher_label" }));
        expect(screen.getByRole("menuitemradio", { name: "reporter.map.layer_default" })).toBeInTheDocument();
        expect(screen.getByRole("menuitemradio", { name: "reporter.map.layer_satellite" })).toBeInTheDocument();
        expect(screen.queryByRole("menuitemradio", { name: "reporter.map.layer_dark" })).not.toBeInTheDocument();
    });

    it("switches to satellite tile on menu item click", async () => {
        const user = userEvent.setup();
        render(<LeafletReportMap features={[]} />);
        await user.click(screen.getByRole("button", { name: "reporter.map.layer_switcher_label" }));
        await user.click(screen.getByRole("menuitemradio", { name: "reporter.map.layer_satellite" }));
        expect(lastTileUrl).toContain("arcgisonline");
    });
});

describe("LeafletReportMap — fullscreen control", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders fullscreen button with enter label by default", () => {
        render(<LeafletReportMap features={[]} />);
        expect(
            screen.getByRole("button", { name: "reporter.map.fullscreen_enter" }),
        ).toBeInTheDocument();
    });
});

describe("LeafletReportMap — locate control", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders locate-me button", () => {
        render(<LeafletReportMap features={[]} />);
        expect(
            screen.getByRole("button", { name: "reporter.map.locate_me" }),
        ).toBeInTheDocument();
    });

    it("locate button is not pressed by default", () => {
        render(<LeafletReportMap features={[]} />);
        const btn = screen.getByRole("button", { name: "reporter.map.locate_me" });
        expect(btn).toHaveAttribute("aria-pressed", "false");
    });
});

describe("LeafletReportMap — zoom control", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders zoom in and zoom out buttons", () => {
        render(<LeafletReportMap features={[]} />);
        expect(screen.getByRole("button", { name: "reporter.map.zoom_in" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "reporter.map.zoom_out" })).toBeInTheDocument();
    });

    it("calls map.zoomIn() when zoom-in is clicked", async () => {
        const user = userEvent.setup();
        render(<LeafletReportMap features={[]} />);
        await user.click(screen.getByRole("button", { name: "reporter.map.zoom_in" }));
        expect(mockMap.zoomIn).toHaveBeenCalledTimes(1);
    });

    it("calls map.zoomOut() when zoom-out is clicked", async () => {
        const user = userEvent.setup();
        render(<LeafletReportMap features={[]} />);
        await user.click(screen.getByRole("button", { name: "reporter.map.zoom_out" }));
        expect(mockMap.zoomOut).toHaveBeenCalledTimes(1);
    });
});
