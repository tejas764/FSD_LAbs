// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import React from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

expect.extend(toHaveNoViolations);

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
        analytics: {
            summary: vi.fn().mockResolvedValue({
                success: true,
                data: {
                    totalReports: 17,
                    reportsByDay: [
                        { date: "2026-04-24", count: 4 },
                        { date: "2026-04-25", count: 6 },
                    ],
                    byDamageLevel: { MINIMAL: 5, PARTIAL: 7, COMPLETE: 5 },
                    byInfraType: [{ type: "ROAD", count: 8 }],
                    pendingModeration: 3,
                    recentReports: [],
                },
            }),
            hotspots: vi.fn().mockResolvedValue({
                success: true,
                data: [
                    { h3Index: "8928308280fffff", centerLat: 27.7, centerLng: 85.3, count: 12, avgDamageLevel: 2.5 },
                ],
            }),
        },
        reports: {
            stream: vi.fn().mockReturnValue({
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                close: vi.fn(),
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
        >
            {selectedId ?? "select"}
        </button>
    ),
}));

vi.mock("@/components/composed/analytics-hotspot-map", () => ({
    AnalyticsHotspotMap: () => <div data-testid="analytics-hotspot-map" />,
}));

import AnalyticsPage from "./page";

describe("Analytics page accessibility", () => {
    it("has no axe violations after selecting a crisis", async () => {
        const { container, getByRole } = render(<AnalyticsPage />);

        await userEvent.click(getByRole("combobox", { name: "reporter.map.crisis_selector_label" }));

        await waitFor(() => {
            expect(container).toHaveTextContent("dashboard.analytics.detail_title");
        });

        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });
});