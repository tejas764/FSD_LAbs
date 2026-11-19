// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { axe, toHaveNoViolations } from "jest-axe";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

expect.extend(toHaveNoViolations);

const profileMock = vi.fn();
const hotspotsMock = vi.fn();
const searchParamsGetMock = vi.fn();

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        reporter: {
            profile: (...args: unknown[]) => profileMock(...args),
        },
        analytics: {
            hotspots: (...args: unknown[]) => hotspotsMock(...args),
        },
    },
}));

vi.mock("next/navigation", () => ({
    useSearchParams: () => ({
        get: (key: string) => searchParamsGetMock(key),
    }),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) =>
            values ? `${key}:${JSON.stringify(values)}` : key,
    }),
}));

import SuccessPage from "./page";

describe("Report success page — a11y", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        profileMock.mockResolvedValue({
            success: true,
            data: {
                reporterId: "anon-1",
                reportCount: 2,
                badgeLevel: "silver",
                lastActiveAt: "2026-04-06T00:00:00.000Z",
            },
        });
        hotspotsMock.mockResolvedValue({ success: true, data: [] });
        searchParamsGetMock.mockImplementation((key: string) => {
            if (key === "reportId") return "report-1";
            if (key === "status") return "synced";
            if (key === "reporterId") return "anon-1";
            if (key === "crisisId") return "crisis-1";
            if (key === "offline") return null;
            return null;
        });
    });

    it("has no axe violations when online with impact section", async () => {
        const { container } = render(<SuccessPage />);

        // Wait for async impact section to load
        await screen.findByText("reporter.success.title");

        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });

    it("has no axe violations when offline (no impact section)", async () => {
        searchParamsGetMock.mockImplementation((key: string) => {
            if (key === "reportId") return "local-1";
            if (key === "status") return "queued";
            if (key === "offline") return "1";
            return null;
        });

        const { container } = render(<SuccessPage />);
        await screen.findByText("reporter.success.title");

        const results = await axe(container);
        expect(results).toHaveNoViolations();
    });
});
