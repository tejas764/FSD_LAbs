// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ── mocks ──────────────────────────────────────────────────────────────────────

const { mockListReports, mockModerate, mockGetById, mockUseSession, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockListReports: vi.fn(),
  mockModerate: vi.fn(),
  mockGetById: vi.fn(),
  mockUseSession: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.selected !== undefined && opts?.total !== undefined) {
        return `${String(opts.selected)} of ${String(opts.total)} row(s) selected.`;
      }
      if (opts?.page) return `page-${String(opts.page)}-of-${String(opts.total)}`;
      return key;
    },
    i18n: { language: "en", dir: () => "ltr" },
  }),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    reports: {
      list: mockListReports,
      moderate: mockModerate,
      getById: mockGetById,
      audit: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: mockUseSession,
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

// ── helper data ────────────────────────────────────────────────────────────────

const makeFeature = (id: string) => ({
  type: "Feature" as const,
  id,
  geometry: { type: "Point" as const, coordinates: [1, 2] as [number, number] },
  properties: {
    crisisId: "c1",
    damageLevel: "PARTIAL" as const,
    submittedAt: "2026-04-10T12:00:00Z",
    isDuplicate: false,
    version: 1,
    infraType: "RESIDENTIAL",
    crisisType: "FLOOD" as const,
    locationText: "Near market",
    moderationStatus: "PENDING" as const,
  },
});

const mockCollection = {
  type: "FeatureCollection" as const,
  features: [makeFeature("r1"), makeFeature("r2"), makeFeature("r3")],
  meta: { limit: 50, nextCursor: null, total: 87 },
};

// ── import after mocks ─────────────────────────────────────────────────────────

import { ReportsTable } from "./reports-table";

// ── tests ──────────────────────────────────────────────────────────────────────

describe("ReportsTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: { user: { id: "u1", role: "analyst" } } });
    mockListReports.mockResolvedValue(mockCollection);
    mockModerate.mockResolvedValue({
      success: true,
      data: {
        id: "r1",
        moderationStatus: "APPROVED",
        moderationNote: null,
        moderatedAt: new Date().toISOString(),
        moderatedBy: "u1",
      },
    });
    mockGetById.mockResolvedValue({
      success: true,
      data: {
        id: "r1",
        crisisId: "c1",
        damageLevel: "PARTIAL",
        infraType: "RESIDENTIAL",
        crisisType: "FLOOD",
        hasDebris: false,
        electricityCondition: "NO_DAMAGE",
        healthServicesFunctioning: "FULLY_FUNCTIONAL",
        pressingNeeds: [],
        submittedAt: "2026-04-10T12:00:00Z",
        isDuplicate: false,
        version: 1,
        extraFields: {},
        infraName: "Road bridge",
        locationText: "Near market",
        photoUrl: null,
      },
    });
  });

  it("shows loading skeleton initially", () => {
    mockListReports.mockReturnValueOnce(new Promise(() => undefined));
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    // Find by role or by text key
    expect(document.querySelector("[aria-busy='true']") ?? screen.queryByText("dashboard.overview.table_loading")).toBeTruthy();
  });

  it("uses action labels for moderation buttons instead of status labels", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    expect((await screen.findAllByRole("button", { name: "dashboard.actions.approve" })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "dashboard.actions.reject" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "dashboard.actions.flag_duplicate" }).length).toBeGreaterThan(0);
  });

  it("renders a compact mobile actions menu trigger with dropdown items", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    const actionsMenuTrigger = await screen.findByTestId("row-actions-menu-r1");
    await userEvent.click(actionsMenuTrigger);

    expect(await screen.findByRole("menuitem", { name: "reporter.my_reports.view_detail" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "dashboard.actions.approve" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "dashboard.actions.reject" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "dashboard.actions.flag_duplicate" })).toBeInTheDocument();
  });

  it("renders column headers", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() => expect(mockListReports).toHaveBeenCalled());
    expect(screen.getByText("dashboard.overview.table_col_crisis")).toBeInTheDocument();
    expect(screen.getByText("dashboard.overview.table_col_date")).toBeInTheDocument();
    expect(screen.getByText("dashboard.overview.table_col_damage")).toBeInTheDocument();
    expect(screen.getByText("dashboard.overview.table_col_infra")).toBeInTheDocument();
    expect(screen.getByText("dashboard.overview.table_col_location")).toBeInTheDocument();
    expect(screen.getByText("dashboard.overview.table_col_status")).toBeInTheDocument();
  });

  it("renders date before crisis in column order", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() => expect(mockListReports).toHaveBeenCalled());

    const headers = screen.getAllByRole("columnheader").map((el) => el.textContent ?? "");
    const dateIndex = headers.findIndex((h) => h.includes("dashboard.overview.table_col_date"));
    const crisisIndex = headers.findIndex((h) => h.includes("dashboard.overview.table_col_crisis"));

    expect(dateIndex).toBeGreaterThan(-1);
    expect(crisisIndex).toBeGreaterThan(-1);
    expect(dateIndex).toBeLessThan(crisisIndex);
  });

  it("sorts table rows by date when the date header is clicked", async () => {
    mockListReports.mockResolvedValue({
      ...mockCollection,
      features: [
        {
          ...makeFeature("r1"),
          properties: {
            ...makeFeature("r1").properties,
            submittedAt: "2026-04-20T10:00:00Z",
            locationText: "Loc newer",
          },
        },
        {
          ...makeFeature("r2"),
          properties: {
            ...makeFeature("r2").properties,
            submittedAt: "2026-04-10T10:00:00Z",
            locationText: "Loc older",
          },
        },
      ],
    });

    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await waitFor(() => expect(mockListReports).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.table_col_date" }));

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Loc older")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Loc newer")).toBeInTheDocument();
  });

  it("sorts table rows by damage when the damage header is clicked", async () => {
    mockListReports.mockResolvedValue({
      ...mockCollection,
      features: [
        {
          ...makeFeature("r1"),
          properties: {
            ...makeFeature("r1").properties,
            damageLevel: "COMPLETE",
            locationText: "Loc complete",
          },
        },
        {
          ...makeFeature("r2"),
          properties: {
            ...makeFeature("r2").properties,
            damageLevel: "MINIMAL",
            locationText: "Loc minimal",
          },
        },
        {
          ...makeFeature("r3"),
          properties: {
            ...makeFeature("r3").properties,
            damageLevel: "PARTIAL",
            locationText: "Loc partial",
          },
        },
      ],
    });

    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await waitFor(() => expect(mockListReports).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.table_col_damage" }));

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("Loc minimal")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Loc partial")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Loc complete")).toBeInTheDocument();
  });

  it("renders a row for each report", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() => expect(mockListReports).toHaveBeenCalled());
    // 3 data rows
    const rows = screen.getAllByRole("row");
    // header row + 3 data rows
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });

  it("renders translated infra and moderation status labels", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() => expect(mockListReports).toHaveBeenCalled());

    expect(screen.getAllByText("wizard.option.infra.RESIDENTIAL").length).toBeGreaterThan(0);
    expect(screen.getAllByText("reporter.my_reports.moderation.PENDING").length).toBeGreaterThan(0);
  });

  it("renders submittedAt in locale-aware date/time format", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await waitFor(() => {
      const firstDataRow = screen.getAllByRole("row")[1];
      const cells = within(firstDataRow).getAllByRole("cell");
      const submittedAtText = cells[1]?.textContent?.trim() ?? "";

      expect(submittedAtText).toContain("2026");
      expect(submittedAtText).not.toBe("10 Apr 2026 12:00");
    });
  });

  it("shows empty state when no reports", async () => {
    mockListReports.mockResolvedValue({ type: "FeatureCollection", features: [], meta: { limit: 50, nextCursor: null, total: 0 } });
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() => expect(screen.getByText("dashboard.overview.table_empty")).toBeInTheDocument());
  });

  it("shows next page button when nextCursor is present", async () => {
    mockListReports.mockResolvedValue({ ...mockCollection, meta: { limit: 50, nextCursor: "cursor-abc", total: 87 } });
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() => expect(mockListReports).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "dashboard.overview.table_next" })).not.toBeDisabled();
  });

  it("prev page button is disabled on first page", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() => expect(mockListReports).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: "dashboard.overview.table_prev" })).toBeDisabled();
  });

  it("re-fetches when crisisId changes", async () => {
    const { rerender } = render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() =>
      expect(mockListReports).toHaveBeenCalledWith(
        expect.objectContaining({ crisisId: "c1" }),
      ),
    );
    rerender(<ReportsTable crisisId="c2" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() =>
      expect(mockListReports).toHaveBeenCalledWith(
        expect.objectContaining({ crisisId: "c2" }),
      ),
    );
  });

  it("passes damageLevel filter to API when not 'all'", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="COMPLETE" dateFrom="" dateTo="" search="" />);
    await waitFor(() =>
      expect(mockListReports).toHaveBeenCalledWith(
        expect.objectContaining({ damageLevel: "COMPLETE" }),
      ),
    );
  });

  it("does not pass damageLevel when filter is 'all'", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);
    await waitFor(() => {
      const call = mockListReports.mock.calls[0][0] as Record<string, unknown>;
      expect(call.damageLevel).toBeUndefined();
    });
  });

  it("shows empty state without fetching when no crisis is selected", async () => {
    render(<ReportsTable crisisId={null} damageFilter="all" dateFrom="" dateTo="" search="" />);

    // Table should not call the API — API requires crisisId or bounds
    await waitFor(() => {
      expect(mockListReports).not.toHaveBeenCalled();
      expect(screen.getByText("dashboard.overview.table_empty")).toBeInTheDocument();
    });
  });

  it("does not fetch when no crisis is selected", async () => {
    render(
      <ReportsTable
        crisisId={null}
        damageFilter="all"
        dateFrom=""
        dateTo=""
        search=""
      />,
    );

    await waitFor(() => {
      expect(mockListReports).not.toHaveBeenCalled();
      expect(screen.getByText("dashboard.overview.table_empty")).toBeInTheDocument();
    });
  });

  it("fetches on initial load for admin without crisis and does not send bounds", async () => {
    render(
      <ReportsTable
        crisisId={null}
        damageFilter="all"
        dateFrom=""
        dateTo=""
        search=""
        isAdmin
      />,
    );

    await waitFor(() => {
      expect(mockListReports).toHaveBeenCalledWith(expect.not.objectContaining({ bounds: expect.anything() }));
      expect(screen.getAllByText("Near market").length).toBeGreaterThan(0);
    });
  });

  it("filters rows by infraType and moderationStatus sent server-side", async () => {
    mockListReports.mockResolvedValue({
      ...mockCollection,
      features: [
        {
          ...makeFeature("r2"),
          properties: {
            ...makeFeature("r2").properties,
            infraType: "UTILITY",
            moderationStatus: "APPROVED",
            locationText: "Hydrant station",
          },
        },
      ],
    });

    render(
      <ReportsTable
        crisisId="c1"
        damageFilter="all"
        dateFrom=""
        dateTo=""
        search=""
        infraType=""
        moderationStatus="APPROVED"
      />,
    );

    await waitFor(() => {
      expect(mockListReports).toHaveBeenCalledWith(
        expect.objectContaining({ moderationStatus: "APPROVED" }),
      );
      expect(screen.getByText("Hydrant station")).toBeInTheDocument();
    });
  });

  it("opens detail sheet from row action", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await userEvent.click(await screen.findAllByRole("button", { name: "reporter.my_reports.view_detail" }).then((b) => b[0]));

    await waitFor(() => {
      expect(screen.getByText("reporter.my_reports.report_detail_title")).toBeInTheDocument();
      expect(mockGetById).toHaveBeenCalledWith("r1");
    });

    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("shows tooltip for action buttons on hover", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    const detailButton = await screen
      .findAllByRole("button", { name: "reporter.my_reports.view_detail" })
      .then((buttons) => buttons[0]);

    await userEvent.hover(detailButton);

    await waitFor(() => {
      expect(screen.getAllByText("reporter.my_reports.view_detail").length).toBeGreaterThan(0);
    });

    const tooltipContent = document.querySelector('[data-slot="tooltip-content"]');
    expect(tooltipContent).toHaveClass("z-[2147483647]");
  });

  it("renders report detail help tooltip inside dialog content", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await userEvent.click(
      await screen.findAllByRole("button", { name: "reporter.my_reports.view_detail" }).then((b) => b[0]),
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "report_detail.help_debris" })).toBeInTheDocument();
    });

    await userEvent.hover(screen.getByRole("button", { name: "report_detail.help_debris" }));

    const tooltipContent = await screen.findByRole("tooltip", { name: "report_detail.help_debris" });
    expect(tooltipContent.closest('[data-slot="sheet-content"]')).not.toBeNull();
  });

  it("does not nest pressing-needs help trigger in a paragraph", async () => {
    mockGetById.mockResolvedValue({
      success: true,
      data: {
        id: "r1",
        crisisId: "c1",
        damageLevel: "PARTIAL",
        infraType: "RESIDENTIAL",
        crisisType: "FLOOD",
        hasDebris: false,
        electricityCondition: "NO_DAMAGE",
        healthServicesFunctioning: "FULLY_FUNCTIONAL",
        pressingNeeds: ["WATER"],
        submittedAt: "2026-04-10T12:00:00Z",
        isDuplicate: false,
        version: 1,
        extraFields: {},
        infraName: "Road bridge",
        locationText: "Near market",
        photoUrl: null,
      },
    });

    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await userEvent.click(
      await screen.findAllByRole("button", { name: "reporter.my_reports.view_detail" }).then((b) => b[0]),
    );

    const helpTrigger = await screen.findByRole("button", { name: "report_detail.help_pressing_needs" });
    expect(helpTrigger.closest("p")).toBeNull();
  });

  it("disables approve/reject actions when the row is already in that status", async () => {
    mockListReports.mockResolvedValue({
      ...mockCollection,
      features: [
        {
          ...makeFeature("r1"),
          properties: {
            ...makeFeature("r1").properties,
            moderationStatus: "APPROVED",
          },
        },
        {
          ...makeFeature("r2"),
          properties: {
            ...makeFeature("r2").properties,
            moderationStatus: "REJECTED",
          },
        },
      ],
    });

    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    const approveButtons = await screen.findAllByRole("button", {
      name: "dashboard.actions.approve",
    });
    const rejectButtons = await screen.findAllByRole("button", {
      name: "dashboard.actions.reject",
    });

    expect(approveButtons[0]).toBeDisabled();
    expect(rejectButtons[0]).not.toBeDisabled();

    expect(approveButtons[1]).not.toBeDisabled();
    expect(rejectButtons[1]).toBeDisabled();
  });

  it("requires confirmation before calling moderate API from row action", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await userEvent.click(await screen.findAllByRole("button", { name: "dashboard.actions.approve" }).then((b) => b[0]));

    expect(mockModerate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "dashboard.reports.confirm_action" }));

    await waitFor(() => {
      expect(mockModerate).toHaveBeenCalledWith("r1", {
        moderationStatus: "APPROVED",
      });
      expect(screen.getAllByText("reporter.my_reports.moderation.APPROVED").length).toBeGreaterThan(0);
      expect(mockToastSuccess).toHaveBeenCalledWith("dashboard.reports.toast_moderation_success");
      expect(mockListReports).toHaveBeenCalledTimes(1);
    });
  });

  it("requires confirmation before calling flag API from row action", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await userEvent.click(await screen.findAllByRole("button", { name: "dashboard.actions.flag_duplicate" }).then((b) => b[0]));

    expect(mockModerate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "dashboard.reports.confirm_action" }));

    await waitFor(() => {
      expect(mockModerate).toHaveBeenCalledWith("r1", {
        moderationStatus: "FLAGGED",
      });
    });
  });

  it("supports bulk approve on selected rows", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await userEvent.click(await screen.findByRole("checkbox", { name: "dashboard.nav.reports r1" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "dashboard.nav.reports r2" }));

    expect(screen.getByText("2 of 3 row(s) selected.")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("bulk-approve"));
    await userEvent.click(screen.getByRole("button", { name: "dashboard.reports.confirm_action" }));

    await waitFor(() => {
      expect(mockModerate).toHaveBeenCalledWith("r1", { moderationStatus: "APPROVED" });
      expect(mockModerate).toHaveBeenCalledWith("r2", { moderationStatus: "APPROVED" });
    });
  });

  it("uses next cursor when navigating to the next page", async () => {
    mockListReports
      .mockResolvedValueOnce({
        ...mockCollection,
        meta: { limit: 50, nextCursor: "cursor-abc", total: 87 },
      })
      .mockResolvedValueOnce({
        ...mockCollection,
        features: [makeFeature("r4")],
        meta: { limit: 50, nextCursor: null, total: 87 },
      });

    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await waitFor(() => expect(mockListReports).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole("button", { name: "dashboard.overview.table_next" }));

    await waitFor(() =>
      expect(mockListReports).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          crisisId: "c1",
          cursor: "cursor-abc",
        }),
      ),
    );
  });

  it("passes default page size limit and renders rows-per-page selector", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await waitFor(() =>
      expect(mockListReports).toHaveBeenCalledWith(
        expect.objectContaining({
          crisisId: "c1",
          limit: 20,
        }),
      ),
    );

    expect(
      screen.getByRole("combobox", { name: "dashboard.overview.table_rows_per_page" }),
    ).toBeInTheDocument();
  });

  it("shows exact total pages from API total count", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    expect(await screen.findByText("page-1-of-5")).toBeInTheDocument();
  });

  it("closes the detail sheet when Escape is pressed", async () => {
    render(<ReportsTable crisisId="c1" damageFilter="all" dateFrom="" dateTo="" search="" />);

    await userEvent.click(
      await screen
        .findAllByRole("button", { name: "reporter.my_reports.view_detail" })
        .then((buttons) => buttons[0]),
    );

    expect(screen.getByText("reporter.my_reports.report_detail_title")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByText("reporter.my_reports.report_detail_title")).not.toBeInTheDocument();
    });
  });
});
