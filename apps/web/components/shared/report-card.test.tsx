// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";

vi.mock("@/components/ui/tooltip", () => ({
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
    TooltipContent: ({ children }: { children: React.ReactNode }) => <div role="tooltip">{children}</div>,
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, values?: Record<string, unknown>) => {
            if (key === "reporter.my_reports.needs_more") {
                return typeof values?.count === "number"
                    ? `+${values.count} more`
                    : "+{{count}} more";
            }
            return key;
        },
    }),
}));

import { ReportCard } from "./report-card";

const BASE_PROPS = {
    id: "abc123",
    infrastructureName: "Riverside Bridge",
    locationText: "Sector 4, North District",
    damagedAt: new Date("2026-04-10T08:00:00Z").toISOString(),
    damageLevel: "PARTIAL" as const,
    syncStatus: "synced" as const,
};

describe("ReportCard", () => {
    it("renders the infrastructure name", () => {
        render(<ReportCard {...BASE_PROPS} />);
        expect(screen.getByText("Riverside Bridge")).toBeInTheDocument();
    });

    it("renders the location text", () => {
        render(<ReportCard {...BASE_PROPS} />);
        expect(screen.getByText("Sector 4, North District")).toBeInTheDocument();
    });

    it("renders damage level via translation key", () => {
        render(<ReportCard {...BASE_PROPS} damageLevel="MINIMAL" />);
        expect(screen.getByText("damage_minimal")).toBeInTheDocument();
    });

    it("renders damage level icon with aria-hidden", () => {
        render(<ReportCard {...BASE_PROPS} />);
        const icon = document.querySelector("[data-testid='damage-icon']");
        expect(icon).not.toBeNull();
        expect(icon?.getAttribute("aria-hidden")).toBe("true");
    });

    it("shows left border with damage-level data attribute for CSS targeting", () => {
        render(<ReportCard {...BASE_PROPS} damageLevel="COMPLETE" />);
        const card = screen.getByRole("article");
        expect(card.getAttribute("data-damage")).toBe("complete");
    });

    it("displays MINIMAL correctly via data-damage attribute", () => {
        render(<ReportCard {...BASE_PROPS} damageLevel="MINIMAL" />);
        const card = screen.getByRole("article");
        expect(card.getAttribute("data-damage")).toBe("minimal");
    });

    it("renders sync status for synced state", () => {
        render(<ReportCard {...BASE_PROPS} syncStatus="synced" />);
        expect(screen.getByText("sync.synced")).toBeInTheDocument();
    });

    it("renders sync status for pending state", () => {
        render(<ReportCard {...BASE_PROPS} syncStatus="pending" />);
        expect(screen.getByText("sync.queued")).toBeInTheDocument();
    });

    it("renders sync status for failed state", () => {
        render(<ReportCard {...BASE_PROPS} syncStatus="failed" />);
        expect(screen.getByText("sync.failed")).toBeInTheDocument();
    });

    it("has role=article for list item semantics", () => {
        render(<ReportCard {...BASE_PROPS} />);
        expect(screen.getByRole("article")).toBeInTheDocument();
    });

    it("displays relative time in hours, not raw minutes", () => {
        // 3 hours ago
        const threeHrsAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
        render(<ReportCard {...BASE_PROPS} damagedAt={threeHrsAgo} />);
        // Should show hours_ago, not minutes_ago
        expect(screen.getByText("time.hours_ago")).toBeInTheDocument();
    });

    it("renders moderation status inside the card when provided", () => {
        render(<ReportCard {...BASE_PROPS} moderationStatus="PENDING" />);
        expect(screen.getByText("reporter.my_reports.moderation.PENDING")).toBeInTheDocument();
    });

    it("renders pressing needs pills inside the card", () => {
        render(<ReportCard {...BASE_PROPS} pressingNeeds={["food_water", "shelter"]} />);
        expect(screen.getByText("wizard.option.pressing.food_water")).toBeInTheDocument();
        expect(screen.getByText("wizard.option.pressing.shelter")).toBeInTheDocument();
    });

    it("renders overflow pill when pressingNeeds > 2 with interpolated count", () => {
        render(<ReportCard {...BASE_PROPS} pressingNeeds={["food_water", "shelter", "health"]} />);
        expect(screen.getByText("+1 more")).toBeInTheDocument();
    });

    it("renders retry and edit buttons inside card when syncStatus=failed", () => {
        const onRetry = vi.fn();
        const onEditRetry = vi.fn();
        render(
            <ReportCard
                {...BASE_PROPS}
                syncStatus="failed"
                onRetry={onRetry}
                onEditRetry={onEditRetry}
            />,
        );
        expect(screen.getByText("reporter.my_reports.retry")).toBeInTheDocument();
        expect(screen.getByText("reporter.my_reports.edit_retry")).toBeInTheDocument();
    });

    it("calls onRetry when retry button is clicked", () => {
        const onRetry = vi.fn();
        render(<ReportCard {...BASE_PROPS} syncStatus="failed" onRetry={onRetry} />);
        fireEvent.click(screen.getByText("reporter.my_reports.retry"));
        expect(onRetry).toHaveBeenCalledOnce();
    });
});
