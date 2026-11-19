// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

afterEach(() => {
    vi.clearAllMocks();
});

const analyticsStreamMock = vi.hoisted(() => {
    type Listener = (event: MessageEvent) => void;

    const listeners = new Map<string, Set<Listener>>();

    return {
        addEventListener: vi.fn((eventName: string, listener: Listener) => {
            const existing = listeners.get(eventName) ?? new Set<Listener>();
            existing.add(listener);
            listeners.set(eventName, existing);
        }),
        removeEventListener: vi.fn((eventName: string, listener: Listener) => {
            listeners.get(eventName)?.delete(listener);
        }),
        close: vi.fn(),
        emit(eventName: string, payload: unknown) {
            const event = { data: JSON.stringify(payload) } as MessageEvent;
            listeners.get(eventName)?.forEach((listener) => listener(event));
        },
        reset() {
            listeners.clear();
            this.addEventListener.mockClear();
            this.removeEventListener.mockClear();
            this.close.mockClear();
        },
    };
});

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { dir: () => "ltr" },
    }),
}));

vi.mock("recharts", () => {
    const containerStub = (name: string, tag = "div") => {
        const Comp = React.forwardRef(
            ({ children, className }: React.PropsWithChildren<{ className?: string }>, ref: React.Ref<Element>) =>
                React.createElement(tag, { "data-recharts": name, className, ref }, children),
        );
        Comp.displayName = `${name}ContainerStub`;
        return Comp;
    };
    const leafStub = (name: string, tag = "g") => {
        const Comp = ({ children }: React.PropsWithChildren<Record<string, unknown>>) =>
            React.createElement(tag, { "data-recharts": name }, children);
        Comp.displayName = `${name}LeafStub`;
        return Comp;
    };
    return {
        ResponsiveContainer: containerStub("ResponsiveContainer"),
        AreaChart: containerStub("AreaChart", "svg"),
        Area: leafStub("Area"),
        XAxis: leafStub("XAxis"),
        YAxis: leafStub("YAxis"),
        CartesianGrid: leafStub("CartesianGrid"),
        Tooltip: leafStub("Tooltip", "foreignObject"),
        PieChart: containerStub("PieChart", "svg"),
        Pie: leafStub("Pie"),
        Cell: leafStub("Cell"),
        BarChart: containerStub("BarChart", "svg"),
        Bar: leafStub("Bar"),
        Legend: leafStub("Legend", "foreignObject"),
    };
});

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        crises: {
            list: vi.fn().mockResolvedValue([
                {
                    id: "c1",
                    name: "Flood West",
                    type: "FLOOD",
                    country: "NP",
                    region: null,
                    startedAt: "2026-04-01T00:00:00Z",
                    isActive: true,
                    extentBBox: null,
                    createdAt: "2026-04-01T00:00:00Z",
                    updatedAt: "2026-04-01T00:00:00Z",
                },
            ]),
        },
        analytics: {
            hotspots: vi.fn().mockResolvedValue({
                success: true,
                data: [
                    { h3Index: "8928308280fffff", centerLat: 27.7, centerLng: 85.3, count: 12, avgDamageLevel: 2.5 },
                    { h3Index: "8928308280fffff2", centerLat: 27.8, centerLng: 85.4, count: 5, avgDamageLevel: 1.2 },
                ],
            }),
            summary: vi.fn().mockResolvedValue({
                success: true,
                data: {
                    totalReports: 17,
                    reportsByDay: [
                        { date: "2026-04-24", count: 4 },
                        { date: "2026-04-25", count: 6 },
                    ],
                    byDamageLevel: {
                        MINIMAL: 5,
                        PARTIAL: 7,
                        COMPLETE: 5,
                    },
                    byInfraType: [
                        { type: "ROAD", count: 8 },
                        { type: "UTILITY", count: 4 },
                    ],
                    pendingModeration: 3,
                    recentReports: [],
                },
            }),
        },
        reports: {
            stream: vi.fn().mockReturnValue(analyticsStreamMock),
            export: vi.fn().mockResolvedValue({ jobId: "job-abc" }),
            exportStatus: vi.fn().mockResolvedValue({
                jobId: "job-abc",
                status: "completed",
                url: "https://example.com/export.csv",
            }),
        },
    },
}));

vi.mock("@/components/composed/crisis-selector", () => ({
    CrisisSelector: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) => (
        <button
            role="combobox"
            aria-label="reporter.map.crisis_selector_label"
            aria-controls="crisis-selector-listbox"
            aria-expanded="false"
            onClick={() => onSelect("c1")}
            data-testid="crisis-selector"
        >
            {selectedId ?? "select"}
        </button>
    ),
}));

vi.mock("@/components/composed/analytics-hotspot-map", () => ({
    AnalyticsHotspotMap: ({ hotspots, className }: { hotspots: Array<{ h3Index: string }>; className?: string }) => (
        <div data-testid="analytics-hotspot-map" data-class-name={className}>{hotspots.length}</div>
    ),
}));

import AnalyticsPage from "./page";

describe("Analytics page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        analyticsStreamMock.reset();
    });

    it("renders the analytics heading", async () => {
        const { apiClient } = await import("@/lib/api/client");
        render(<AnalyticsPage />);
        await waitFor(() => {
            expect(apiClient.analytics.summary).toHaveBeenCalled();
        });
        expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
        expect(screen.getByText("dashboard.analytics.title")).toBeInTheDocument();
    });

    it("renders the crisis selector", async () => {
        const { apiClient } = await import("@/lib/api/client");
        render(<AnalyticsPage />);
        await waitFor(() => {
            expect(apiClient.analytics.summary).toHaveBeenCalled();
        });
        expect(screen.getByTestId("crisis-selector")).toBeInTheDocument();
    });

    it("renders the damage filter control", async () => {
        const { apiClient } = await import("@/lib/api/client");
        render(<AnalyticsPage />);
        await waitFor(() => {
            expect(apiClient.analytics.summary).toHaveBeenCalled();
        });
        const damageSelect = screen.getByRole("combobox", { name: "dashboard.map.filter_damage_label" });
        expect(damageSelect).toBeInTheDocument();
        expect(damageSelect.className).toContain("h-8");
    });

    it("loads all-crises analytics on initial render", async () => {
        const { apiClient } = await import("@/lib/api/client");
        render(<AnalyticsPage />);

        await waitFor(() => {
            expect(apiClient.analytics.summary).toHaveBeenCalledWith(null, "all");
        });
    });

    it("does not fetch hotspots until a crisis is selected", async () => {
        const { apiClient } = await import("@/lib/api/client");
        render(<AnalyticsPage />);

        // Wait for summary to be called, then verify hotspots was NOT called
        await waitFor(() => {
            expect(apiClient.analytics.summary).toHaveBeenCalledWith(null, "all");
        });
        expect(apiClient.analytics.hotspots).not.toHaveBeenCalled();
    });

    it("does not show crisis prompt on initial render", async () => {
        render(<AnalyticsPage />);

        await waitFor(() => {
            expect(screen.queryByText("dashboard.overview.select_crisis_prompt")).not.toBeInTheDocument();
        });
    });

    it("loads hotspots after crisis is selected", async () => {
        const { apiClient } = await import("@/lib/api/client");
        render(<AnalyticsPage />);
        const selector = screen.getByTestId("crisis-selector");
        await userEvent.click(selector);
        await waitFor(() => {
            expect(apiClient.analytics.hotspots).toHaveBeenCalledWith("c1", undefined);
        });
    });

    it("subscribes to realtime updates after crisis selection", async () => {
        const { apiClient } = await import("@/lib/api/client");
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await waitFor(() => {
            expect(apiClient.reports.stream).toHaveBeenCalledWith("c1");
        });

        await act(async () => {
            analyticsStreamMock.emit("report.updated", { crisisId: "c1" });
        });

        await waitFor(() => {
            expect(apiClient.analytics.hotspots).toHaveBeenCalledTimes(2);
        });
        expect(apiClient.analytics.summary).toHaveBeenCalledTimes(3);
    });

    it("shows LIVE badge when the analytics stream becomes ready", async () => {
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await act(async () => {
            analyticsStreamMock.emit("ready", { crisisId: "c1" });
        });

        expect(screen.getByRole("status")).toHaveTextContent("dashboard.map.live_badge");
    });

    it("hides LIVE badge when the analytics stream errors", async () => {
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await act(async () => {
            analyticsStreamMock.emit("ready", { crisisId: "c1" });
        });

        await act(async () => {
            analyticsStreamMock.emit("error", { crisisId: "c1" });
        });

        expect(screen.queryByText("dashboard.map.live_badge")).not.toBeInTheDocument();
    });

    it("loads summary stats after crisis is selected", async () => {
        const { apiClient } = await import("@/lib/api/client");
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await waitFor(() => {
            expect(apiClient.analytics.summary).toHaveBeenCalledWith("c1", "all");
        });

        expect(screen.getByText("17")).toBeInTheDocument();
        expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("renders analytics sections after crisis selection", async () => {
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await waitFor(() => {
            expect(screen.getByText("dashboard.analytics.trend_title")).toBeInTheDocument();
            expect(screen.getByText("dashboard.analytics.stats_title")).toBeInTheDocument();
            expect(screen.getByText("dashboard.analytics.detail_title")).toBeInTheDocument();
        });
    });

    it("renders the analytics map without bordered card chrome", async () => {
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await waitFor(() => {
            expect(screen.getByTestId("analytics-map-panel")).toBeInTheDocument();
        });

        expect(screen.getByTestId("analytics-map-panel")).not.toHaveClass("border");
        expect(screen.getByTestId("analytics-hotspot-map")).toHaveAttribute("data-class-name", expect.stringContaining("border-0"));
        expect(screen.getByTestId("analytics-hotspot-map")).toHaveAttribute("data-class-name", expect.stringContaining("rounded-none"));
    });

    it("refetches hotspots when the damage filter changes", async () => {
        const { apiClient } = await import("@/lib/api/client");
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        fireEvent.click(screen.getByRole("combobox", { name: "dashboard.map.filter_damage_label" }));
        fireEvent.click(await screen.findByRole("option", { name: "damage_complete" }));

        await waitFor(() => {
            expect(apiClient.analytics.hotspots).toHaveBeenLastCalledWith("c1", "COMPLETE");
        });
    });

    it("shows selected hotspot details", async () => {
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await userEvent.click(screen.getByRole("button", { name: "8928308280fffff 27.700 85.300" }));

        expect(screen.getAllByText("12").length).toBeGreaterThan(0);
        expect(screen.getByText("dashboard.analytics.detail_title")).toBeInTheDocument();
    });

    it("shows hotspot coverage from report share, not hotspot count ratio", async () => {
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await waitFor(() => {
            expect(screen.getByText("dashboard.analytics.stat_coverage")).toBeInTheDocument();
        });

        // 12 + 5 reports in hotspots out of 17 total should show full coverage.
        expect(screen.getByText("100%")).toBeInTheDocument();
    });

    it("shows selected hotspot share metric instead of global complete-damage percentage", async () => {
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await waitFor(() => {
            expect(screen.getByText("dashboard.analytics.detail_share")).toBeInTheDocument();
        });

        expect(screen.getByText("70.6%")).toBeInTheDocument();
        expect(screen.queryByText("dashboard.overview.stat_complete_pct")).not.toBeInTheDocument();
    });

    it("shows hotspot click hint for discoverability", async () => {
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await waitFor(() => {
            expect(screen.getByText("dashboard.analytics.hotspots_click_hint")).toBeInTheDocument();
        });
    });

    it("uses shared dashboard data table component for hotspots table", async () => {
        render(<AnalyticsPage />);

        await userEvent.click(screen.getByTestId("crisis-selector"));

        await waitFor(() => {
            expect(screen.getByTestId("dashboard-data-table")).toBeInTheDocument();
        });
    });

    it("paginates hotspots table rows", async () => {
        const { apiClient } = await import("@/lib/api/client");
        const manyHotspots = Array.from({ length: 21 }).map((_, index) => ({
            h3Index: `h3-${String(index + 1).padStart(3, "0")}`,
            centerLat: 27.7 + index * 0.001,
            centerLng: 85.3 + index * 0.001,
            count: index + 1,
            avgDamageLevel: 1.5,
        }));

        vi.mocked(apiClient.analytics.hotspots).mockResolvedValue({
            success: true,
            data: manyHotspots,
        });

        render(<AnalyticsPage />);
        await userEvent.click(screen.getByTestId("crisis-selector"));

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "h3-001 27.700 85.300" })).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "h3-021 27.720 85.320" })).not.toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.table_next" }));

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "h3-021 27.720 85.320" })).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "h3-001 27.700 85.300" })).not.toBeInTheDocument();
        });
    });
});
