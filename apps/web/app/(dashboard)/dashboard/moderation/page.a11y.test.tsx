// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";

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

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        reports: {
            list: vi.fn().mockResolvedValue({
                type: "FeatureCollection",
                features: [
                    {
                        type: "Feature",
                        id: "r1",
                        geometry: { type: "Point", coordinates: [1, 2] },
                        properties: {
                            crisisId: "c1",
                            damageLevel: "PARTIAL",
                            submittedAt: "2026-04-11T12:00:00Z",
                            isDuplicate: false,
                            version: 1,
                            infraType: "RESIDENTIAL",
                            crisisType: "FLOOD",
                            locationText: "Newest",
                            moderationStatus: "PENDING",
                        },
                    },
                ],
                meta: { limit: 100, nextCursor: null },
            }),
            moderate: vi.fn().mockResolvedValue({ success: true, data: {} }),
            audit: vi.fn().mockResolvedValue({
                success: true,
                data: {
                    items: [],
                    pagination: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 },
                },
            }),
        },
    },
}));

vi.mock("@/components/composed/crisis-selector", () => ({
    CrisisSelector: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) => (
        <button
            type="button"
            role="combobox"
            aria-label="reporter.map.crisis_selector_label"
            aria-controls="moderation-crisis-selector-listbox"
            aria-expanded="false"
            onClick={() => onSelect("c1")}
        >
            {selectedId ?? "none"}
        </button>
    ),
}));

vi.mock("@/components/composed/report-detail-popover", () => ({
    ReportDetailContent: ({ reportId }: { reportId: string }) => <div>{reportId}</div>,
}));

import ModerationPage from "./page";

describe("Moderation page accessibility", () => {
    it("has no axe violations after loading queue", async () => {
        const { container, getByRole } = render(<ModerationPage />);

        await userEvent.click(getByRole("combobox", { name: "reporter.map.crisis_selector_label" }));

        await waitFor(() => {
            expect(container).toHaveTextContent("dashboard.nav.moderation");
            expect(container).toHaveTextContent("Newest");
        });

        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });
});
