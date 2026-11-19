// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeAll, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const { mockModerate } = vi.hoisted(() => ({
    mockModerate: vi.fn(),
}));

const reportSidebarSpy = vi.fn();

// ─── polyfills (Radix) ────────────────────────────────────────────────────────
beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    if (typeof window.ResizeObserver === "undefined") {
        window.ResizeObserver = class {
            observe() { }
            unobserve() { }
            disconnect() { }
        };
    }
});

afterEach(() => {
    document.body.removeAttribute("data-scroll-locked");
    document.body.style.pointerEvents = "";
    vi.clearAllMocks();
});

// ─── mocks ───────────────────────────────────────────────────────────────────

vi.mock("next/dynamic", () => ({
    default: () => {
        const Comp = ({
            "aria-label": label,
            legendClassName,
            onSelectReport,
            onFeaturesLoaded,
            onLiveStatusChange,
        }: {
            "aria-label"?: string;
            legendClassName?: string;
            onSelectReport?: (id: string) => void;
            onFeaturesLoaded?: (features: Array<{
                id: string;
                lat: number;
                lng: number;
                damageLevel: string;
                submittedAt: string;
                moderationStatus: string | null;
                isDuplicate: boolean;
                version: number;
            }>) => void;
            onLiveStatusChange?: (isLive: boolean) => void;
        }) => (
            <div data-testid="mock-map" aria-label={label} role="region" data-legend-class={legendClassName}>
                <button
                    type="button"
                    onClick={() =>
                        onFeaturesLoaded?.([
                            {
                                id: "r1",
                                lat: 1,
                                lng: 2,
                                damageLevel: "PARTIAL",
                                submittedAt: "2026-04-10T12:00:00Z",
                                moderationStatus: "PENDING",
                                isDuplicate: false,
                                version: 1,
                            },
                            {
                                id: "r2",
                                lat: 3,
                                lng: 4,
                                damageLevel: "PARTIAL",
                                submittedAt: "2026-04-10T12:00:00Z",
                                moderationStatus: "APPROVED",
                                isDuplicate: false,
                                version: 1,
                            },
                            {
                                id: "r3",
                                lat: 5,
                                lng: 6,
                                damageLevel: "PARTIAL",
                                submittedAt: "2026-05-10T12:00:00Z",
                                moderationStatus: "APPROVED",
                                isDuplicate: false,
                                version: 1,
                            },
                        ])
                    }
                >
                    load features
                </button>
                <button type="button" onClick={() => onSelectReport?.("r1")}>open report</button>
                <button type="button" onClick={() => onLiveStatusChange?.(true)}>set live true</button>
                <button type="button" onClick={() => onLiveStatusChange?.(false)}>set live false</button>
            </div>
        );
        Comp.displayName = "MockMapReporterView";
        return Comp;
    },
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts?.count !== undefined) return `${key}:${String(opts.count)}`;
            return key;
        },
        i18n: { language: "en", dir: () => "ltr" },
    }),
}));

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        reports: {
            moderate: mockModerate,
        },
    },
}));

vi.mock("@/lib/api/crises-utils", () => ({
    getCountryName: (code: string) => code,
}));

vi.mock("@/components/ui/skeleton", () => ({
    Skeleton: ({ className }: { className?: string }) => (
        <div data-testid="skeleton" className={className} />
    ),
}));

vi.mock("@/components/map/map-legend", () => ({
    MapLegend: () => <div data-testid="map-legend" />,
}));

vi.mock("@/hooks/use-mobile", () => ({
    useIsMobile: () => false,
}));

vi.mock("@/lib/time", () => ({
    formatRelativeTime: (_date: string) => "2h ago",
}));

vi.mock("@/lib/utils", () => ({
    cn: (...args: string[]) => args.filter(Boolean).join(" "),
    formatCoords: (lat: number, lng: number) => `${lat},${lng}`,
}));

vi.mock("@/components/shared/bottom-sheet", () => ({
    BottomSheet: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="bottom-sheet">{children}</div>
    ),
}));

vi.mock("@/components/composed/report-sidebar", () => ({
    ReportSidebar: (props: unknown) => {
        reportSidebarSpy(props);
        return <div data-testid="mock-report-sidebar" />;
    },
}));

vi.mock("@/components/composed/report-detail-popover", () => ({
    ReportDetailContent: ({ reportId }: { reportId: string }) => (
        <div data-testid="report-detail">{reportId}</div>
    ),
}));

// ─── import after mocks ───────────────────────────────────────────────────────

import { DashboardMapView } from "./dashboard-map-view";

// ─── helpers ──────────────────────────────────────────────────────────────────

const defaultProps = {
    crisisId: null as string | null,
    damageFilter: "all" as const,
    dateFrom: "",
    dateTo: "",
    infraType: "",
    moderationStatus: "",
    search: "",
    onReportCount: vi.fn(),
};

// ─── tests ────────────────────────────────────────────────────────────────────

describe("DashboardMapView", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockModerate.mockResolvedValue({ success: true });
        reportSidebarSpy.mockClear();
    });

    it("renders the map with accessible label", () => {
        render(<DashboardMapView {...defaultProps} />);
        expect(
            screen.getByRole("region", { name: /dashboard\.map\.aria_label/i }),
        ).toBeInTheDocument();
    });

    it("renders the report feed panel region", () => {
        render(<DashboardMapView {...defaultProps} />);
        expect(
            screen.getByRole("region", { name: /dashboard\.map\.feed_label/i }),
        ).toBeInTheDocument();
    });

    it("calls onReportCount when features are loaded", () => {
        render(<DashboardMapView {...defaultProps} />);
        // onFeaturesLoaded is called with [] initially
        expect(defaultProps.onReportCount).toHaveBeenCalledWith(0);
    });

    it("applies the damageFilter received from parent", () => {
        render(<DashboardMapView {...defaultProps} damageFilter="COMPLETE" />);
        expect(screen.getByRole("region", { name: /dashboard\.map\.feed_label/i })).toBeInTheDocument();
    });

    it("passes bottom-start legend position to the map component", () => {
        render(<DashboardMapView {...defaultProps} />);
        expect(screen.getByTestId("mock-map")).toHaveAttribute("data-legend-class", "bottom-4 start-4");
    });

    it("filters loaded features before rendering the sidebar", async () => {
        render(
            <DashboardMapView
                {...defaultProps}
                damageFilter="PARTIAL"
                dateFrom="2026-04-01"
                dateTo="2026-04-30"
                infraType="UTILITY"
                moderationStatus="APPROVED"
                search="bridge"
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "load features" }));

        expect(defaultProps.onReportCount).toHaveBeenLastCalledWith(1);
        expect(reportSidebarSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({
                reportCount: 1,
                externalSearch: "bridge",
                features: [expect.objectContaining({ id: "r2" })],
            }),
        );
    });

    it("opens detail sheet and allows moderation actions from map view", async () => {
        render(<DashboardMapView {...defaultProps} />);

        await userEvent.click(screen.getByRole("button", { name: "load features" }));
        await userEvent.click(screen.getByRole("button", { name: "open report" }));

        expect(screen.getByText("reporter.my_reports.report_detail_title")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "dashboard.actions.approve" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "dashboard.actions.reject" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "dashboard.actions.flag_duplicate" })).toBeInTheDocument();
    });

    it("asks confirmation before map moderation API call", async () => {
        render(<DashboardMapView {...defaultProps} />);

        await userEvent.click(screen.getByRole("button", { name: "load features" }));
        await userEvent.click(screen.getByRole("button", { name: "open report" }));

        await userEvent.click(screen.getByRole("button", { name: "dashboard.actions.approve" }));

        expect(mockModerate).not.toHaveBeenCalled();
        expect(screen.getByText("dashboard.reports.confirm_title")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "dashboard.reports.confirm_action" }));

        expect(mockModerate).toHaveBeenCalledWith("r1", { moderationStatus: "APPROVED" });
    });
});

// ─── LIVE badge ───────────────────────────────────────────────────────────────

describe("DashboardMapView — LIVE status badge", () => {
    it("shows LIVE badge when map reports live=true", async () => {
        render(<DashboardMapView {...defaultProps} crisisId="crisis-1" />);

        await userEvent.click(screen.getByRole("button", { name: "set live true" }));

        expect(screen.getByText("dashboard.map.live_badge")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveClass("z-[450]");
    });

    it("hides LIVE badge when map reports live=false after being live", async () => {
        render(<DashboardMapView {...defaultProps} crisisId="crisis-1" />);

        await userEvent.click(screen.getByRole("button", { name: "set live true" }));
        await userEvent.click(screen.getByRole("button", { name: "set live false" }));

        expect(screen.queryByText("dashboard.map.live_badge")).not.toBeInTheDocument();
    });

    it("does not show LIVE badge initially", () => {
        render(<DashboardMapView {...defaultProps} crisisId="crisis-1" />);
        expect(screen.queryByText("dashboard.map.live_badge")).not.toBeInTheDocument();
    });
});
