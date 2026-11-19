// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockUseSession, mockListReports, mockModerate, mockAudit, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
    mockUseSession: vi.fn(),
    mockListReports: vi.fn(),
    mockModerate: vi.fn(),
    mockAudit: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string, opts?: Record<string, unknown>) => {
            if (opts?.count !== undefined) return `${key}:${String(opts.count)}`;
            if (opts?.selected !== undefined && opts?.total !== undefined)
                return `${String(opts.selected)} of ${String(opts.total)} row(s) selected.`;
            if (opts?.page !== undefined && opts?.total !== undefined)
                return `Page ${String(opts.page)} of ${String(opts.total)}`;
            return key;
        },
        i18n: { language: "en", dir: () => "ltr" },
    }),
}));

vi.mock("@/lib/auth-client", () => ({
    useSession: mockUseSession,
}));

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        reports: {
            list: mockListReports,
            moderate: mockModerate,
            audit: mockAudit,
        },
    },
}));

vi.mock("sonner", () => ({
    toast: {
        success: mockToastSuccess,
        error: mockToastError,
    },
}));

vi.mock("@/components/composed/crisis-selector", () => ({
    CrisisSelector: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) => (
        <button
            type="button"
            role="combobox"
            aria-controls="moderation-crisis-selector-listbox"
            aria-expanded="false"
            aria-label="reporter.map.crisis_selector_label"
            onClick={() => onSelect("c1")}
            data-testid="moderation-crisis-selector"
        >
            {selectedId ?? "none"}
        </button>
    ),
}));

vi.mock("@/components/composed/report-detail-popover", () => ({
    ReportDetailContent: ({
        reportId,
        showAuditTrail,
        canLoadAudit,
    }: {
        reportId: string;
        showAuditTrail?: boolean;
        canLoadAudit?: boolean;
    }) => (
        <div data-testid="report-detail">
            {reportId}
            {showAuditTrail && canLoadAudit ? (
                <button type="button" onClick={() => void mockAudit(reportId, 1, 10)}>
                    dashboard.moderation.load_audit
                </button>
            ) : null}
            {showAuditTrail && canLoadAudit ? <span>reporter.my_reports.moderation.APPROVED</span> : null}
        </div>
    ),
}));

vi.mock("@/components/composed/reports-moderation-confirm-dialog", () => ({
    ReportsModerationConfirmDialog: ({
        open,
        onConfirm,
    }: {
        open: boolean;
        onConfirm: () => void;
        onOpenChange: (v: boolean) => void;
        status: string | null;
        count: number;
    }) =>
        open ? (
            <button type="button" data-testid="confirm-dialog-action" onClick={onConfirm}>
                confirm
            </button>
        ) : null,
}));

const makeFeature = (id: string, overrides?: Partial<{ moderationStatus: string | null; submittedAt: string; damageLevel: "MINIMAL" | "PARTIAL" | "COMPLETE"; locationText: string }>) => ({
    type: "Feature" as const,
    id,
    geometry: { type: "Point" as const, coordinates: [1, 2] as [number, number] },
    properties: {
        crisisId: "c1",
        damageLevel: overrides?.damageLevel ?? ("PARTIAL" as const),
        submittedAt: overrides?.submittedAt ?? "2026-04-10T12:00:00Z",
        isDuplicate: false,
        version: 1,
        infraType: "RESIDENTIAL",
        crisisType: "FLOOD" as const,
        locationText: overrides?.locationText ?? `Location ${id}`,
        moderationStatus: overrides?.moderationStatus ?? "PENDING",
    },
});

import ModerationPage from "./page";

describe("Dashboard moderation page", () => {
    beforeEach(() => {
        mockUseSession.mockReturnValue({ data: { user: { id: "u1", role: "analyst" } } });
        mockListReports.mockResolvedValue({
            type: "FeatureCollection",
            features: [
                makeFeature("r1", { moderationStatus: "PENDING", submittedAt: "2026-04-11T12:00:00Z", locationText: "Newest" }),
                makeFeature("r2", { moderationStatus: "APPROVED", locationText: "Approved" }),
                makeFeature("r3", { moderationStatus: "PENDING", submittedAt: "2026-04-09T12:00:00Z", locationText: "Older" }),
            ],
            meta: { limit: 100, nextCursor: null, total: 87 },
        });
        mockModerate.mockResolvedValue({ success: true, data: {} });
        mockAudit.mockResolvedValue({
            success: true,
            data: {
                items: [
                    {
                        id: "a1",
                        reportId: "r1",
                        action: "UPDATE_MODERATION",
                        actorId: "admin-1",
                        previousValue: { moderationStatus: "PENDING" },
                        newValue: { moderationStatus: "APPROVED" },
                        createdAt: "2026-04-11T13:00:00Z",
                    },
                ],
                pagination: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
            },
        });
    });

    it("shows empty queue state before selecting a crisis for non-admin users", () => {
        render(<ModerationPage />);
        expect(screen.getByText("dashboard.moderation.select_crisis_hint")).toBeInTheDocument();
        expect(mockListReports).not.toHaveBeenCalled();
    });

    it("loads only pending reports after selecting a crisis", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        await waitFor(() => {
            expect(mockListReports).toHaveBeenCalledWith(
                expect.objectContaining({ crisisId: "c1", moderationStatus: "PENDING" }),
            );
            expect(screen.getByText("Newest")).toBeInTheDocument();
            expect(screen.getByText("Older")).toBeInTheDocument();
            expect(screen.queryByText("Approved")).not.toBeInTheDocument();
        });
    });

    it("renders moderation queue in a dense table layout", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        expect(await screen.findByRole("table")).toBeInTheDocument();
    });

    it("renders translated infrastructure labels in queue rows", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        expect((await screen.findAllByText("wizard.option.infra.RESIDENTIAL")).length).toBeGreaterThan(0);
    });

    it("renders a compact mobile actions menu trigger with dropdown items", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        const actionsMenuTrigger = await screen.findByTestId("moderation-row-actions-menu-r1");
        await userEvent.click(actionsMenuTrigger);

        expect(screen.getByRole("menuitem", { name: "reporter.my_reports.view_detail" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "dashboard.actions.approve" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "dashboard.actions.reject" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "dashboard.actions.flag_duplicate" })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: "dashboard.moderation.needs_more_info" })).toBeInTheDocument();
    });

    it("quick approve shows confirm dialog then calls moderate API for the correct report", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        const approveButtons = await screen.findAllByRole("button", { name: "dashboard.actions.approve" });
        await userEvent.click(approveButtons[0]);

        expect(mockModerate).not.toHaveBeenCalled();

        const confirmBtn = await screen.findByTestId("confirm-dialog-action");
        await userEvent.click(confirmBtn);

        await waitFor(() => {
            expect(mockModerate).toHaveBeenCalledWith("r1", { moderationStatus: "APPROVED" });
            expect(screen.queryByText("Newest")).not.toBeInTheDocument();
            expect(mockToastSuccess).toHaveBeenCalledWith("dashboard.moderation.toast_approved_success");
        });
    });

    it("bulk approve shows confirm dialog then moderates selected reports", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        await userEvent.click(await screen.findByRole("checkbox", { name: "dashboard.nav.reports r1" }));
        await userEvent.click(await screen.findByRole("checkbox", { name: "dashboard.nav.reports r3" }));
        await userEvent.click(screen.getByTestId("bulk-approve"));

        // confirm dialog appears
        const confirmBtn = await screen.findByTestId("confirm-dialog-action");
        await userEvent.click(confirmBtn);

        await waitFor(() => {
            expect(mockModerate).toHaveBeenCalledWith("r1", { moderationStatus: "APPROVED" });
            expect(mockModerate).toHaveBeenCalledWith("r3", { moderationStatus: "APPROVED" });
        });
    });

    it("needs more info shows confirm dialog then marks the report under review", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        mockModerate.mockClear();

        const underReviewButtons = await screen.findAllByRole("button", {
            name: "dashboard.moderation.needs_more_info",
        });
        await userEvent.click(underReviewButtons[0]);

        expect(mockModerate).not.toHaveBeenCalled();

        const confirmBtn = await screen.findByTestId("confirm-dialog-action");
        await userEvent.click(confirmBtn);

        await waitFor(() => {
            expect(mockModerate).toHaveBeenCalledWith("r1", { moderationStatus: "UNDER_REVIEW" });
        });
    });

    it("supports selecting all queued reports", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        const selectAll = await screen.findByRole("checkbox", { name: "dashboard.moderation.select_all" });
        await userEvent.click(selectAll);

        const reportCheckboxes = await screen.findAllByRole("checkbox", { name: /dashboard.nav.reports/ });
        expect(reportCheckboxes).toHaveLength(2);
        for (const reportCheckbox of reportCheckboxes) {
            expect(reportCheckbox).toBeChecked();
        }
    });

    it("opens detail sheet and loads audit trail", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        await userEvent.click(
            await screen.findAllByRole("button", { name: "reporter.my_reports.view_detail" }).then((buttons) => buttons[0]),
        );
        await userEvent.click(await screen.findByRole("button", { name: "dashboard.moderation.load_audit" }));

        await waitFor(() => {
            expect(screen.getByText("reporter.my_reports.report_detail_title")).toBeInTheDocument();
            expect(screen.getByTestId("report-detail")).toHaveTextContent("r1");
            expect(mockAudit).toHaveBeenCalledWith("r1", 1, 10);
            expect(screen.getByText("reporter.my_reports.moderation.APPROVED")).toBeInTheDocument();
        });
    });

    it("does not request audit trail for non-moderator roles", async () => {
        mockUseSession.mockReturnValue({ data: { user: { id: "u-viewer", role: "viewer" } } });
        mockAudit.mockClear();
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        await userEvent.click(
            await screen.findAllByRole("button", { name: "reporter.my_reports.view_detail" }).then((buttons) => buttons[0]),
        );

        await waitFor(() => {
            expect(screen.getByText("reporter.my_reports.report_detail_title")).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "dashboard.moderation.load_audit" })).not.toBeInTheDocument();
            expect(mockAudit).not.toHaveBeenCalled();
        });
    });

    it("renders table empty state when no pending reports exist", async () => {
        mockListReports.mockResolvedValueOnce({
            type: "FeatureCollection",
            features: [makeFeature("r9", { moderationStatus: "APPROVED", locationText: "Approved only" })],
            meta: { limit: 100, nextCursor: null, total: 87 },
        });

        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        const emptyMessage = await screen.findByText("dashboard.moderation.empty");
        expect(emptyMessage.closest("td")).toHaveClass("text-center");
    });

    it("shows page indicator in footer after loading reports", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        expect(await screen.findByText("Page 1 of 5")).toBeInTheDocument();
    });

    it("supports sorting queue rows by date", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        await screen.findByText("Newest");

        const getOrder = () =>
            screen
                .getAllByRole("row")
                .filter((row) => row.querySelector("td"))
                .map((row) => row.querySelector("td:nth-child(2) p")?.textContent ?? "");

        expect(getOrder()).toEqual(["Newest", "Older"]);

        await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.table_col_date" }));

        expect(getOrder()).toEqual(["Older", "Newest"]);
    });

    it("shows selection count in the top bulk action bar after rows are selected", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        await userEvent.click(await screen.findByRole("checkbox", { name: "dashboard.nav.reports r1" }));
        expect(screen.getByText("1 of 2 row(s) selected.")).toBeInTheDocument();
    });

    it("uses default page size limit and renders rows-per-page selector", async () => {
        render(<ModerationPage />);
        await userEvent.click(screen.getByTestId("moderation-crisis-selector"));

        await waitFor(() => {
            expect(mockListReports).toHaveBeenCalledWith(
                expect.objectContaining({
                    crisisId: "c1",
                    limit: 20,
                    moderationStatus: "PENDING",
                }),
            );
        });

        expect(
            screen.getByRole("combobox", { name: "dashboard.overview.table_rows_per_page" }),
        ).toBeInTheDocument();
    });
});
