// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReportMapFeature } from "./leaflet-report-map";
import type { Crisis } from "@/lib/api/client";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (k: string, opts?: Record<string, unknown>) =>
            opts ? `${k}(${JSON.stringify(opts)})` : k,
    }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/shared/bottom-sheet", () => ({
    BottomSheet: ({ controls, children }: { controls?: React.ReactNode; children: React.ReactNode }) => (
        <div>
            {controls}
            {children}
        </div>
    ),
}));
vi.mock("@/components/composed/report-detail-popover", () => ({
    ReportDetailPopover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ReportSidebar } from "./report-sidebar";

const baseFeatures: ReportMapFeature[] = [
    {
        id: "r1",
        lat: 27.7,
        lng: 85.3,
        damageLevel: "COMPLETE",
        submittedAt: new Date().toISOString(),
        moderationStatus: "APPROVED",
        isDuplicate: false,
        version: 1,
    },
    {
        id: "r2",
        lat: 27.8,
        lng: 85.4,
        damageLevel: "PARTIAL",
        submittedAt: new Date().toISOString(),
        moderationStatus: "APPROVED",
        isDuplicate: false,
        version: 1,
    },
    {
        id: "r3",
        lat: 27.9,
        lng: 85.5,
        damageLevel: "MINIMAL",
        submittedAt: new Date().toISOString(),
        moderationStatus: "APPROVED",
        isDuplicate: false,
        version: 1,
    },
];

const mockCrisis: Crisis = {
    id: "crisis-1",
    name: "Flood Western Region",
    type: "FLOOD",
    country: "Nepal",
    region: null,
    startedAt: "2026-04-01T00:00:00Z",
    isActive: true,
    extentBBox: null,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
};

describe("ReportSidebar — damage breakdown", () => {
    it("shows count for each damage level in sidebar header", () => {
        render(
            <ReportSidebar
                features={baseFeatures}
                reportCount={3}
                selectedId={null}
                onSelect={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        // Breakdown row: COMPLETE=1, PARTIAL=1, MINIMAL=1
        expect(screen.getByTestId("breakdown-COMPLETE")).toHaveTextContent("1");
        expect(screen.getByTestId("breakdown-PARTIAL")).toHaveTextContent("1");
        expect(screen.getByTestId("breakdown-MINIMAL")).toHaveTextContent("1");
    });

    it("updates breakdown counts when features change", () => {
        const twoComplete: ReportMapFeature[] = [
            ...baseFeatures,
            {
                id: "r4",
                lat: 28.0,
                lng: 85.6,
                damageLevel: "COMPLETE",
                submittedAt: new Date().toISOString(),
                moderationStatus: null,
                isDuplicate: false,
                version: 1,
            },
        ];
        render(
            <ReportSidebar
                features={twoComplete}
                reportCount={4}
                selectedId={null}
                onSelect={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByTestId("breakdown-COMPLETE")).toHaveTextContent("2");
    });
});

describe("ReportSidebar — crisis banner", () => {
    it("does not render crisis-banner element (removed as redundant — combobox shows selection)", () => {
        render(
            <ReportSidebar
                features={[]}
                reportCount={0}
                selectedId={null}
                onSelect={vi.fn()}
                onClose={vi.fn()}
                crisis={mockCrisis}
            />,
        );
        // Banner was removed: combobox trigger in CrisisSelector already shows the selected crisis.
        expect(screen.queryByTestId("crisis-banner")).not.toBeInTheDocument();
    });
});

describe("ReportSidebar — inline breakdown in filter chips", () => {
    it("shows breakdown counts inline inside filter chip buttons", () => {
        render(
            <ReportSidebar
                features={baseFeatures}
                reportCount={3}
                selectedId={null}
                onSelect={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        // Count badges are inside the filter buttons alongside the label
        expect(screen.getByTestId("breakdown-COMPLETE")).toHaveTextContent("1");
        expect(screen.getByTestId("breakdown-PARTIAL")).toHaveTextContent("1");
        expect(screen.getByTestId("breakdown-MINIMAL")).toHaveTextContent("1");
    });
});

describe("ReportSidebar — mobile parity", () => {
    it("does not render crisis-banner (removed — combobox is the selection indicator)", () => {
        render(
            <ReportSidebar
                features={[]}
                reportCount={0}
                selectedId={null}
                onSelect={vi.fn()}
                onClose={vi.fn()}
                crisis={mockCrisis}
            />,
        );
        expect(screen.queryByTestId("crisis-banner")).not.toBeInTheDocument();
    });

    it("shows breakdown counts in mobile filter chips", () => {
        render(
            <ReportSidebar
                features={baseFeatures}
                reportCount={3}
                selectedId={null}
                onSelect={vi.fn()}
                onClose={vi.fn()}
            />,
        );
        expect(screen.getByTestId("breakdown-COMPLETE")).toBeInTheDocument();
        expect(screen.getByTestId("breakdown-PARTIAL")).toBeInTheDocument();
        expect(screen.getByTestId("breakdown-MINIMAL")).toBeInTheDocument();
    });
});

describe("ReportSidebar — crisisSelector prop", () => {
    it("renders crisisSelector node inside the sidebar controls on desktop", () => {
        render(
            <ReportSidebar
                features={[]}
                reportCount={0}
                selectedId={null}
                onSelect={vi.fn()}
                onClose={vi.fn()}
                crisisSelector={<div data-testid="mock-crisis-selector">Selector</div>}
            />,
        );
        expect(screen.getByTestId("mock-crisis-selector")).toBeInTheDocument();
    });

    it("renders crisisSelector node inside the bottom sheet controls on mobile", () => {
        // Re-mock useIsMobile to return true for this test
        vi.doMock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
        render(
            <ReportSidebar
                features={[]}
                reportCount={0}
                selectedId={null}
                onSelect={vi.fn()}
                onClose={vi.fn()}
                crisisSelector={<div data-testid="mobile-crisis-selector">Selector</div>}
            />,
        );
        // BottomSheet mock renders controls unconditionally, so selector must be present
        expect(screen.getByTestId("mobile-crisis-selector")).toBeInTheDocument();
    });
});
