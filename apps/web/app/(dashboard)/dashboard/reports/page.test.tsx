// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockUseSession } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", dir: () => "ltr" },
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: mockUseSession,
}));

vi.mock("@/components/composed/crisis-selector", () => ({
  CrisisSelector: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) => (
    <button
      role="combobox"
      aria-label="reporter.map.crisis_selector_label"
      aria-controls="reports-crisis-selector-listbox"
      aria-expanded="false"
      onClick={() => onSelect("c1")}
      data-testid="reports-crisis-selector"
    >
      {selectedId ?? "none"}
    </button>
  ),
}));

vi.mock("@/components/composed/dashboard-filter-sheet", () => ({
  DashboardFilterSheet: ({ onApply }: { onApply: (value: { dateFrom: string; dateTo: string; infraType: string; moderationStatus: string; timePeriod: string }) => void }) => (
    <button
      type="button"
      data-testid="reports-filter-sheet"
      onClick={() =>
        onApply({
          dateFrom: "2026-04-01",
          dateTo: "2026-04-30",
          infraType: "UTILITY",
          moderationStatus: "APPROVED",
          timePeriod: "",
        })
      }
    />
  ),
}));

const tableSpy = vi.fn();
const mapSpy = vi.fn();

vi.mock("@/components/composed/reports-table", () => ({
  ReportsTable: (props: unknown) => {
    tableSpy(props);
    return <div data-testid="reports-table" />;
  },
}));

vi.mock("@/components/composed/dashboard-map-view", () => ({
  DashboardMapView: (props: unknown) => {
    mapSpy(props);
    return <div data-testid="reports-map" />;
  },
}));

import DashboardReportsPage from "./page";

describe("Dashboard reports page", () => {
  beforeEach(() => {
    mockUseSession.mockReturnValue({ data: null });
    tableSpy.mockClear();
    mapSpy.mockClear();
  });

  it("renders heading and defaults to table view", () => {
    render(<DashboardReportsPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("dashboard.nav.reports");
    expect(screen.getByTestId("reports-table")).toBeInTheDocument();
    expect(screen.queryByTestId("reports-map")).not.toBeInTheDocument();
    expect(tableSpy).toHaveBeenLastCalledWith(expect.any(Object));
  });

  it("switches between table and map views", async () => {
    render(<DashboardReportsPage />);
    await userEvent.click(screen.getByRole("radio", { name: "dashboard.overview.view_map" }));
    expect(screen.getByTestId("reports-map")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "dashboard.overview.view_table" }));
    expect(screen.getByTestId("reports-table")).toBeInTheDocument();
  });

  it("preserves active filters when toggling views", async () => {
    render(<DashboardReportsPage />);

    await userEvent.click(screen.getByTestId("reports-crisis-selector"));
    await userEvent.type(screen.getByLabelText("reporter.map.search_label"), "bridge");

    await userEvent.click(screen.getByRole("radio", { name: "dashboard.overview.view_map" }));
    await waitFor(() => {
      expect(mapSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          crisisId: "c1",
          search: "bridge",
        }),
      );
    });

    await userEvent.click(screen.getByRole("radio", { name: "dashboard.overview.view_table" }));
    await waitFor(() => {
      expect(tableSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          crisisId: "c1",
          search: "bridge",
        }),
      );
    });
  });

  it("passes admin state to table view for uppercase ADMIN role", async () => {
    mockUseSession.mockReturnValue({ data: { user: { role: "ADMIN" } } });

    render(<DashboardReportsPage />);

    await waitFor(() => {
      expect(tableSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          crisisId: null,
          isAdmin: true,
        }),
      );
    });
  });

  it("passes advanced filters to map view", async () => {
    render(<DashboardReportsPage />);

    await userEvent.click(screen.getByTestId("reports-filter-sheet"));
    await userEvent.click(screen.getByRole("radio", { name: "dashboard.overview.view_map" }));

    await waitFor(() => {
      expect(mapSpy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: "2026-04-01",
          dateTo: "2026-04-30",
          infraType: "UTILITY",
          moderationStatus: "APPROVED",
        }),
      );
    });
  });
});
