// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

expect.extend(toHaveNoViolations);

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: "en", dir: () => "ltr" },
    }),
}));

vi.mock("@/lib/auth-client", () => ({
    useSession: () => ({ data: null }),
}));

vi.mock("@/components/composed/crisis-selector", () => ({
    CrisisSelector: ({ selectedId }: { selectedId: string | null }) => (
        <button
            role="combobox"
            aria-label="reporter.map.crisis_selector_label"
            aria-controls="reports-crisis-selector-listbox"
            aria-expanded="false"
            type="button"
        >
            {selectedId ?? "none"}
        </button>
    ),
}));

vi.mock("@/components/composed/dashboard-filter-sheet", () => ({
    DashboardFilterSheet: () => <div data-testid="reports-filter-sheet" />,
}));

vi.mock("@/components/composed/reports-table", () => ({
    ReportsTable: () => <div data-testid="reports-table" />,
}));

vi.mock("@/components/composed/dashboard-map-view", () => ({
    DashboardMapView: () => <div data-testid="reports-map" />,
}));

import DashboardReportsPage from "./page";

describe("Dashboard reports page accessibility", () => {
    it("has no axe violations in default table view", async () => {
        const { container } = render(<DashboardReportsPage />);
        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });
});
