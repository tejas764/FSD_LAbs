// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

expect.extend(toHaveNoViolations);

const { exportSpy, exportStatusSpy } = vi.hoisted(() => ({
    exportSpy: vi.fn(),
    exportStatusSpy: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { dir: () => "ltr" },
    }),
}));

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        reports: {
            export: exportSpy,
            exportStatus: exportStatusSpy,
        },
    },
}));

vi.mock("@/components/composed/crisis-selector", () => ({
    CrisisSelector: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) => (
        <button
            role="combobox"
            aria-label="dashboard.map.crisis_selector_label"
            aria-controls="export-crisis-selector-listbox"
            aria-expanded="false"
            onClick={() => onSelect("c1")}
        >
            {selectedId ?? "none"}
        </button>
    ),
}));

vi.mock("@/components/composed/export-viewport-map", () => ({
    ExportViewportMap: () => <div data-testid="export-viewport-map" />,
}));

import DashboardExportPage from "./page";

describe("Dashboard export page accessibility", () => {
    it("has no axe violations after queuing an export", async () => {
        exportSpy.mockResolvedValue({ jobId: "job-1" });
        exportStatusSpy.mockResolvedValue({
            jobId: "job-1",
            status: "completed",
            url: "https://example.com/export.csv",
            expiresAt: "2099-01-01T00:00:00.000Z",
        });

        const { container, getByRole } = render(<DashboardExportPage />);

        await userEvent.click(getByRole("combobox", { name: "dashboard.map.crisis_selector_label" }));
        await userEvent.click(getByRole("button", { name: "dashboard.export.submit" }));

        await waitFor(() => {
            expect(container).toHaveTextContent("dashboard.export.recent_title");
        });

        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });
});
