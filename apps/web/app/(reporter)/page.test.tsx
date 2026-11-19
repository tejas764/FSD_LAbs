// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
  }),
}));

vi.mock("@/components/composed/map-reporter-view", () => ({
  MapReporterView: (_props: Record<string, unknown>) => (
    <div data-testid="map-reporter-view" role="region" aria-label="map" />
  ),
}));

vi.mock("@/components/composed/report-sidebar", () => ({
  ReportSidebar: ({ crisisSelector }: { crisisSelector?: React.ReactNode }) => (
    <div data-testid="report-sidebar">{crisisSelector}</div>
  ),
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ state: "expanded", isMobile: false }),
}));

vi.mock("@/lib/report-panel-context", () => ({
  useReportPanel: () => ({ collapsed: false, toggle: () => { } }),
}));

vi.mock("@/components/composed/crisis-selector", () => ({
  CrisisSelector: (props: { selectedId: string | null; onSelect: (id: string) => void }) => (
    <div data-testid="crisis-selector" data-selected={props.selectedId ?? ""} />
  ),
}));

import LandingPage from "./page";

describe("Reporter landing page", () => {
  it("renders the map reporter view", () => {
    render(<LandingPage />);
    expect(screen.getByTestId("map-reporter-view")).toBeInTheDocument();
  });

  it("renders FAB link with i18n aria-label pointing to /report", () => {
    render(<LandingPage />);
    const fab = screen.getByRole("link", {
      name: "reporter.actions.new_report",
    });
    expect(fab).toBeInTheDocument();
    expect(fab).toHaveAttribute("href", "/report");
  });

  it("renders skip-to-list anchor for keyboard users", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("link", { name: "map.skip_to_list" }),
    ).toBeInTheDocument();
  });

  it("renders CrisisSelector in sidebar area", () => {
    render(<LandingPage />);
    expect(screen.getByTestId("crisis-selector")).toBeInTheDocument();
  });
});
