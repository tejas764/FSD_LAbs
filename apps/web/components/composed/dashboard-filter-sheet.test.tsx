// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

if (!("hasPointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
        configurable: true,
        value: () => false,
    });
}

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { dir: () => "ltr" },
    }),
}));

import { DashboardFilterSheet } from "./dashboard-filter-sheet";

describe("DashboardFilterSheet", () => {
    it("renders an accessible sheet description", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));

        expect(document.querySelector('[data-slot="sheet-description"]')).toBeInTheDocument();
    });

    it("sheet content is present in the DOM when opened", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));

        // SheetContent uses Radix built-in slide animation via data-state transitions
        const sheetContent = document.querySelector('[data-slot="sheet-content"]');
        expect(sheetContent).toBeInTheDocument();
        expect(sheetContent).toHaveAttribute("data-state", "open");
    });

    it("renders overlay above map layers", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));

        const overlay = document.querySelector('[data-slot="sheet-overlay"]');
        expect(overlay).toHaveClass("z-[1200]");
    });

    it("applies selected infrastructure and moderation filters", async () => {
        const onApply = vi.fn();

        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={onApply}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));

        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_infra_type" }));
        await userEvent.click(await screen.findByRole("option", { name: "wizard.option.infra.UTILITY" }));

        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_moderation_status" }));
        await userEvent.click(await screen.findByRole("option", { name: "reporter.my_reports.moderation.APPROVED" }));

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_apply" }));

        expect(onApply).toHaveBeenCalledWith({
            dateFrom: "",
            dateTo: "",
            infraType: "UTILITY",
            moderationStatus: "APPROVED",
            timePeriod: "",
        });
    });

    it("renders moderation status options via i18n keys", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));
        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_moderation_status" }));

        for (const status of ["PENDING", "FLAGGED", "UNDER_REVIEW", "APPROVED", "REJECTED"]) {
            expect(
                await screen.findByRole("option", { name: `reporter.my_reports.moderation.${status}` }),
            ).toBeInTheDocument();
        }
    });

    it("renders infrastructure type options via i18n keys", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));
        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_infra_type" }));

        for (const type of ["RESIDENTIAL", "COMMERCIAL", "UTILITY", "GOVERNMENT", "OTHER"]) {
            expect(
                await screen.findByRole("option", { name: `wizard.option.infra.${type}` }),
            ).toBeInTheDocument();
        }
    });

    it("displays selected value in infrastructure select field", async () => {
        const onApply = vi.fn();

        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={onApply}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));

        const infraCombobox = screen.getByRole("combobox", { name: "dashboard.overview.filter_infra_type" });
        await userEvent.click(infraCombobox);
        await userEvent.click(await screen.findByRole("option", { name: "wizard.option.infra.GOVERNMENT" }));

        // Value should display in the select trigger
        expect(infraCombobox).toHaveTextContent("GOVERNMENT");
    });

    it("renders select dropdown above sheet layers", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));
        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_infra_type" }));

        const listbox = await screen.findByRole("listbox");
        expect(listbox).toHaveClass("z-[1302]");
    });

    it("renders infrastructure dropdown inside sheet content", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));
        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_infra_type" }));

        const listbox = await screen.findByRole("listbox");
        expect(listbox.closest('[data-slot="sheet-content"]')).not.toBeNull();
    });

    it("renders time period select with all preset options including Custom", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));

        const select = screen.getByRole("combobox", { name: "dashboard.overview.filter_date_range" });
        expect(select).toBeInTheDocument();
        await userEvent.click(select);

        expect(await screen.findByRole("option", { name: "dashboard.overview.period_7d" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "dashboard.overview.period_30d" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "dashboard.overview.period_90d" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "dashboard.overview.period_365d" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "dashboard.overview.period_all" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "dashboard.overview.period_custom" })).toBeInTheDocument();
    });

    it("selecting a period preset applies timePeriod to filter", async () => {
        const onApply = vi.fn();

        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={onApply}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));
        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_date_range" }));
        await userEvent.click(await screen.findByRole("option", { name: "dashboard.overview.period_30d" }));
        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_apply" }));

        expect(onApply).toHaveBeenCalledWith(
            expect.objectContaining({ timePeriod: "30d" }),
        );
    });

    it("hides date inputs when no custom period is selected", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));

        expect(screen.queryByLabelText("dashboard.overview.filter_date_from")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("dashboard.overview.filter_date_to")).not.toBeInTheDocument();
    });

    it("shows start/end date inputs when Custom is selected", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));
        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_date_range" }));
        await userEvent.click(await screen.findByRole("option", { name: "dashboard.overview.period_custom" }));

        expect(screen.getByLabelText("dashboard.overview.filter_date_from")).toBeInTheDocument();
        expect(screen.getByLabelText("dashboard.overview.filter_date_to")).toBeInTheDocument();
    });

    it("applies custom date range when Custom is selected and dates are entered", async () => {
        const onApply = vi.fn();

        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={onApply}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));
        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_date_range" }));
        await userEvent.click(await screen.findByRole("option", { name: "dashboard.overview.period_custom" }));

        await userEvent.type(screen.getByLabelText("dashboard.overview.filter_date_from"), "2026-01-01");
        await userEvent.type(screen.getByLabelText("dashboard.overview.filter_date_to"), "2026-03-31");
        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_apply" }));

        expect(onApply).toHaveBeenCalledWith(
            expect.objectContaining({ timePeriod: "custom", dateFrom: "2026-01-01", dateTo: "2026-03-31" }),
        );
    });

    it("clears custom dates when switching from Custom to a preset", async () => {
        const onApply = vi.fn();

        render(
            <DashboardFilterSheet
                value={{ dateFrom: "2026-01-01", dateTo: "2026-03-31", infraType: "", moderationStatus: "", timePeriod: "custom" }}
                onApply={onApply}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));
        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_date_range" }));
        await userEvent.click(await screen.findByRole("option", { name: "dashboard.overview.period_30d" }));
        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_apply" }));

        expect(onApply).toHaveBeenCalledWith(
            expect.objectContaining({ timePeriod: "30d", dateFrom: "", dateTo: "" }),
        );
    });

    it("can render only date range controls for overview reuse", async () => {
        render(
            <DashboardFilterSheet
                value={{ dateFrom: "", dateTo: "", infraType: "", moderationStatus: "", timePeriod: "" }}
                onApply={vi.fn()}
                sections={["timePeriod"]}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));

        expect(screen.getByRole("combobox", { name: "dashboard.overview.filter_date_range" })).toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "dashboard.overview.filter_infra_type" })).not.toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "dashboard.overview.filter_moderation_status" })).not.toBeInTheDocument();
    });
});
