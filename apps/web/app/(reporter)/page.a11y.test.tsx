import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) =>
            opts ? `${key}(${JSON.stringify(opts)})` : key,
    }),
}));

vi.mock("@/components/composed/map-reporter-view", () => ({
    MapReporterView: (_props: Record<string, unknown>) => (
        <div
            data-testid="map-reporter-view"
            role="region"
            aria-label="Crisis damage map"
        />
    ),
}));

vi.mock("@/components/ui/sidebar", () => ({
    useSidebar: () => ({ state: "expanded", isMobile: false }),
}));

vi.mock("@/lib/report-panel-context", () => ({
    useReportPanel: () => ({ collapsed: false, toggle: () => { } }),
}));

vi.mock("@/components/composed/crisis-selector", () => ({
    CrisisSelector: () => <div data-testid="crisis-selector" />,
}));

vi.mock("@/components/composed/report-sidebar", () => ({
    ReportSidebar: () => <aside data-testid="report-sidebar" aria-label="Reports" />,
}));

import LandingPage from "./page";

expect.extend(toHaveNoViolations);

describe("Reporter landing page — a11y", () => {
    it("has no axe violations", async () => {
        const { container } = render(<LandingPage />);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });
});
