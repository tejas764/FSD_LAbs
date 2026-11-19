// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as React from "react";

const listAllMock = vi.fn();
const retryReportMock = vi.fn();
const pushMock = vi.fn();

vi.mock("@/lib/offline/queue", () => ({
  listAll: () => listAllMock(),
}));

vi.mock("@/lib/offline/sync", () => ({
  retryReport: (...args: unknown[]) => retryReportMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => pushMock(...args),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }),
}));

// Inline tooltip mock so Portal/hover behaviour doesn't block jsdom tests
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div role="tooltip">{children}</div>
  ),
}));

vi.mock("@/components/composed/report-detail-popover", () => ({
  ReportDetailContent: ({ reportId }: { reportId: string; fallback?: React.ReactNode }) => (
    <div data-testid="report-detail-content" data-report-id={reportId}>remote-detail</div>
  ),
}));

import MyReportsPage from "./page";

describe("MyReports page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty state when no reports exist", async () => {
    listAllMock.mockResolvedValue([]);

    render(<MyReportsPage />);

    expect(
      await screen.findByText("reporter.my_reports.empty"),
    ).toBeInTheDocument();
  });

  it("renders failed local report with retry and edit actions", async () => {
    listAllMock.mockResolvedValue([
      {
        id: "local-1",
        idempotencyKey: "uuid-1",
        formDataSerialized: { crisisId: "crisis-1", description: "desc" },
        photoBlobKey: "blob-1",
        status: "failed",
        createdAt: "2026-04-06T00:00:00.000Z",
        retryCount: 3,
        lastError: "too_many_requests",
      },
    ]);

    render(<MyReportsPage />);

    expect(await screen.findByText("sync.failed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "reporter.my_reports.retry" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "reporter.my_reports.edit_retry" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "reporter.my_reports.retry" }),
    );
    await waitFor(() => {
      expect(retryReportMock).toHaveBeenCalledWith(
        "local-1",
        expect.any(Function),
      );
    });

    fireEvent.click(
      screen.getByRole("button", { name: "reporter.my_reports.edit_retry" }),
    );
    expect(pushMock).toHaveBeenCalledWith("/report?draftId=local-1");
  });

  it("shows +N more button and tooltip for reports with >2 pressing needs", async () => {
    listAllMock.mockResolvedValue([
      {
        id: "local-tooltip",
        idempotencyKey: "uuid-tooltip",
        formDataSerialized: {
          crisisId: "crisis-1",
          pressingNeeds: ["FOOD_WATER", "WASH", "SHELTER_REPAIR", "HEALTHCARE_MEDICINES"],
        },
        photoBlobKey: null,
        status: "synced",
        createdAt: "2026-04-10T00:00:00.000Z",
        retryCount: 0,
        lastError: null,
      },
    ]);

    render(<MyReportsPage />);

    // "+2 more" trigger button should appear
    const moreBtn = await screen.findByRole("button", { name: /needs_more/ });
    expect(moreBtn).toBeInTheDocument();

    // Tooltip content lists the hidden needs (always rendered by mock)
    expect(
      screen.getByText("wizard.option.pressing.SHELTER_REPAIR"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("wizard.option.pressing.HEALTHCARE_MEDICINES"),
    ).toBeInTheDocument();
  });

  it("opens ReportDetailContent with server id for online-submitted (saveSyncedReport) reports", async () => {
    // saveSyncedReport stores item with id = serverId; no separate serverId field
    listAllMock.mockResolvedValue([
      {
        id: "server-id-1",
        // no serverId field — simulates online submit via saveSyncedReport
        idempotencyKey: "server-id-1",
        formDataSerialized: {
          crisisId: "crisis-1",
          crisisName: "Crisis 1",
          pressingNeeds: ["FOOD_WATER"],
          damageLevel: "PARTIAL",
        },
        photoBlobKey: null,
        status: "synced",
        createdAt: "2026-04-10T00:00:00.000Z",
        retryCount: 0,
        lastError: null,
      },
    ]);

    render(<MyReportsPage />);
    fireEvent.click(await screen.findByText("Crisis 1"));

    const detail = await screen.findByTestId("report-detail-content");
    expect(detail).toHaveAttribute("data-report-id", "server-id-1");
  });

  it("renders filter chip buttons: All, Pending, Synced, Failed", async () => {
    listAllMock.mockResolvedValue([]);

    render(<MyReportsPage />);
    await screen.findByText("reporter.my_reports.empty");

    expect(screen.getByRole("button", { name: "reporter.my_reports.filter.all" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "reporter.my_reports.filter.pending" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "reporter.my_reports.filter.synced" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "reporter.my_reports.filter.failed" })).toBeInTheDocument();
  });

  it("filtering to Synced hides failed reports", async () => {
    listAllMock.mockResolvedValue([
      {
        id: "local-synced",
        idempotencyKey: "uuid-s",
        formDataSerialized: { crisisId: "crisis-1", damageLevel: "MINIMAL", infraName: "Bridge A", locationText: "Zone 1" },
        photoBlobKey: null,
        status: "synced",
        createdAt: "2026-04-10T00:00:00.000Z",
        retryCount: 0,
        lastError: null,
      },
      {
        id: "local-failed",
        idempotencyKey: "uuid-f",
        formDataSerialized: { crisisId: "crisis-1", damageLevel: "PARTIAL", infraName: "Road B", locationText: "Zone 2" },
        photoBlobKey: null,
        status: "failed",
        createdAt: "2026-04-10T00:01:00.000Z",
        retryCount: 1,
        lastError: null,
      },
    ]);

    render(<MyReportsPage />);
    await screen.findByText("Bridge A");

    fireEvent.click(screen.getByRole("button", { name: "reporter.my_reports.filter.synced" }));

    await waitFor(() => {
      expect(screen.queryByText("Road B")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Bridge A")).toBeInTheDocument();
  });

  it("renders report items using article role when damage level is set", async () => {
    listAllMock.mockResolvedValue([
      {
        id: "local-article",
        idempotencyKey: "uuid-a",
        formDataSerialized: { crisisId: "crisis-1", damageLevel: "PARTIAL", infraName: "Hospital", locationText: "North sector" },
        photoBlobKey: null,
        status: "synced",
        createdAt: "2026-04-10T00:00:00.000Z",
        retryCount: 0,
        lastError: null,
      },
    ]);

    render(<MyReportsPage />);
    await screen.findByText("Hospital");

    expect(screen.getAllByRole("article").length).toBeGreaterThan(0);
  });

  it("opens ReportDetailContent with serverId when synced report has a serverId", async () => {
    listAllMock.mockResolvedValue([
      {
        id: "local-uuid-1",
        serverId: "server-uuid-1",
        idempotencyKey: "uuid-s",
        formDataSerialized: { crisisId: "crisis-1", damageLevel: "MINIMAL", infraName: "Bridge A" },
        photoBlobKey: null,
        status: "synced",
        createdAt: "2026-04-10T00:00:00.000Z",
        retryCount: 0,
        lastError: null,
      },
    ]);

    render(<MyReportsPage />);
    fireEvent.click(await screen.findByText("Bridge A"));

    const detail = await screen.findByTestId("report-detail-content");
    expect(detail).toHaveAttribute("data-report-id", "server-uuid-1");
  });

  it("shows LocalReportDetail (not remote fetch) for legacy synced items without serverId", async () => {
    // Simulates a report that was queued offline, synced, but built before the serverId fix
    // (legacy: id=localUUID, no serverId). Should fall back to local detail.
    listAllMock.mockResolvedValue([
      {
        id: "local-uuid-2",
        // no serverId, and idempotencyKey differs from id (legacy offline record)
        idempotencyKey: "uuid-s2",
        formDataSerialized: { crisisId: "crisis-1", damageLevel: "PARTIAL", infraName: "Road B" },
        photoBlobKey: null,
        status: "synced",
        createdAt: "2026-04-10T00:00:00.000Z",
        retryCount: 0,
        lastError: null,
      },
    ]);

    render(<MyReportsPage />);
    fireEvent.click(await screen.findByText("Road B"));

    await waitFor(() => {
      expect(screen.queryByTestId("report-detail-content")).not.toBeInTheDocument();
    });
    expect(screen.getByText("reporter.my_reports.local_detail_notice")).toBeInTheDocument();
  });
});
