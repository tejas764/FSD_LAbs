// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class {
      observe() { }
      unobserve() { }
      disconnect() { }
    };
  }
});

afterEach(() => {
  document.body.removeAttribute("data-scroll-locked");
  document.body.style.pointerEvents = "";
  vi.clearAllMocks();
});

const { mockSummary, mockHotspots } = vi.hoisted(() => ({
  mockSummary: vi.fn().mockResolvedValue({
    success: true,
    data: {
      totalReports: 4821,
      reportsByDay: [
        { date: "2026-04-15", count: 30 },
        { date: "2026-04-16", count: 47 },
      ],
      byDamageLevel: { MINIMAL: 2508, PARTIAL: 1591, COMPLETE: 722 },
      byInfraType: [
        { type: "ROAD", count: 1639 },
        { type: "RESIDENTIAL", count: 1350 },
      ],
      pendingModeration: 12,
      recentReports: [
        {
          id: "r1",
          damageLevel: "PARTIAL",
          infraType: "ROAD",
          locationText: "Main St",
          submittedAt: "2026-04-16T10:00:00Z",
        },
      ],
    },
  }),
  mockHotspots: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { h3Index: "h1", centerLat: 36.2, centerLng: 36.1, count: 120, avgDamageLevel: 2.1 },
      { h3Index: "h2", centerLat: 36.3, centerLng: 36.2, count: 85, avgDamageLevel: 1.5 },
    ],
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en", dir: () => "ltr" } }),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    crises: {
      list: vi.fn().mockResolvedValue([
        {
          id: "c1",
          name: "Flood West",
          type: "FLOOD",
          country: "NP",
          region: null,
          startedAt: "2026-04-01T00:00:00Z",
          isActive: true,
          extentBBox: null,
          createdAt: "2026-04-01T00:00:00Z",
          updatedAt: "2026-04-01T00:00:00Z",
        },
      ]),
    },
    analytics: {
      summary: mockSummary,
      hotspots: mockHotspots,
    },
  },
}));

// Recharts renders SVG — stub it so JSDOM does not choke
vi.mock("recharts", () => {
  const containerStub = (name: string, tag = "div") => {
    const Comp = React.forwardRef(
      ({ children, className }: React.PropsWithChildren<{ className?: string }>, ref: React.Ref<Element>) =>
        React.createElement(tag, { "data-recharts": name, className, ref }, children),
    );
    Comp.displayName = `${name}ContainerStub`;
    return Comp;
  };
  const leafStub = (name: string, tag = "g") => {
    const Comp = ({ children }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement(tag, { "data-recharts": name }, children);
    Comp.displayName = `${name}LeafStub`;
    return Comp;
  };
  return {
    ResponsiveContainer: containerStub("ResponsiveContainer"),
    AreaChart: containerStub("AreaChart", "svg"),
    Area: leafStub("Area"),
    XAxis: leafStub("XAxis"),
    YAxis: leafStub("YAxis"),
    CartesianGrid: leafStub("CartesianGrid"),
    Tooltip: leafStub("Tooltip", "foreignObject"),
    PieChart: containerStub("PieChart", "svg"),
    Pie: leafStub("Pie"),
    Cell: leafStub("Cell"),
    BarChart: containerStub("BarChart", "svg"),
    Bar: leafStub("Bar"),
    Legend: leafStub("Legend", "foreignObject"),
    RadialBarChart: containerStub("RadialBarChart", "svg"),
    RadialBar: leafStub("RadialBar"),
  };
});

vi.mock("@/components/composed/crisis-selector", () => ({
  CrisisSelector: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) => (
    <button
      role="combobox"
      aria-label="reporter.map.crisis_selector_label"
      aria-controls="dashboard-crisis-selector-listbox"
      aria-expanded="false"
      onClick={() => onSelect("c1")}
    >
      {selectedId ?? "crisis-selector"}
    </button>
  ),
}));

import DashboardOverviewPage from "./page";

function renderWithPendingFetch() {
  mockSummary.mockImplementationOnce(() => new Promise(() => undefined));
  mockHotspots.mockImplementationOnce(() => new Promise(() => undefined));
  return render(<DashboardOverviewPage />);
}

describe("DashboardOverview page — structure", () => {
  it("renders exactly one h1", () => {
    renderWithPendingFetch();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders the crisis selector", () => {
    renderWithPendingFetch();
    expect(screen.getByRole("combobox", { name: /crisis_selector_label/i })).toBeInTheDocument();
  });

  it("renders the shared filter sheet trigger", () => {
    renderWithPendingFetch();
    expect(screen.getByRole("button", { name: "dashboard.overview.filter_label" })).toBeInTheDocument();
  });

  it("shows empty-state prompt while initial all-crises load is pending", async () => {
    mockSummary.mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    render(<DashboardOverviewPage />);
    expect(screen.getByText("dashboard.overview.select_crisis_prompt")).toBeInTheDocument();
    expect(screen.getByTestId("dashboard-skeleton-kpis")).toBeInTheDocument();
  });

  it("uses a two-column mobile grid for crisis and period controls", () => {
    const { container } = renderWithPendingFetch();
    const controls = container.querySelector('[data-testid="dashboard-controls"]');
    expect(controls).not.toBeNull();
    expect(controls?.className).toContain("grid");
    expect(controls?.className).toContain("grid-cols-2");
    expect(controls?.className).toContain("sm:flex");
  });
});

describe("DashboardOverview page — KPI cards", () => {
  it("renders 4 KPI stat cards after selecting a crisis", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      const cards = screen.getAllByRole("article");
      expect(cards.length).toBeGreaterThanOrEqual(4);
    });
  });

  it("shows all 4 KPI labels", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getAllByText("dashboard.overview.stat_total_reports").length).toBeGreaterThan(0);
      expect(screen.getAllByText("dashboard.overview.stat_today").length).toBeGreaterThan(0);
      expect(screen.getAllByText("dashboard.overview.stat_pending_moderation").length).toBeGreaterThan(0);
      expect(screen.getAllByText("dashboard.overview.stat_complete_pct").length).toBeGreaterThan(0);
    });
  });

  it("shows totalReports value from API (formatted)", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.getByText("4,821")).toBeInTheDocument());
  });

  it("shows pendingModeration value from API", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.getByText("12")).toBeInTheDocument());
  });

  it("shows +0 when there are no reports for current day", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.getByText("+0")).toBeInTheDocument());
  });

  it("formats large KPI numbers with grouping separators consistently", async () => {
    const todayIsoDate = new Date().toISOString().slice(0, 10);

    mockSummary.mockResolvedValue({
      success: true,
      data: {
        totalReports: 4911087,
        reportsByDay: [{ date: todayIsoDate, count: 4911 }],
        byDamageLevel: { MINIMAL: 0, PARTIAL: 0, COMPLETE: 0 },
        byInfraType: [],
        pendingModeration: 4911012,
        recentReports: [],
      },
    });

    render(<DashboardOverviewPage />);

    await waitFor(() => {
      expect(screen.getByText("4,911,087")).toBeInTheDocument();
      expect(screen.getByText("+4,911")).toBeInTheDocument();
      expect(screen.getByText("4,911,012")).toBeInTheDocument();
    });
  });
});

describe("DashboardOverview page — charts", () => {
  it("renders reports-over-time section heading", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() =>
      expect(screen.getByText("dashboard.overview.chart_reports_over_time")).toBeInTheDocument(),
    );
  });

  it("renders damage-breakdown section heading", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() =>
      expect(screen.getByText("dashboard.overview.chart_damage_breakdown")).toBeInTheDocument(),
    );
  });

  it("renders infra-type section heading", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() =>
      expect(screen.getByText("dashboard.overview.chart_infra_breakdown")).toBeInTheDocument(),
    );
  });
});

describe("DashboardOverview page — hotspot list", () => {
  it("renders hotspot section heading", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() =>
      expect(screen.getByText("dashboard.overview.hotspots_title")).toBeInTheDocument(),
    );
  });

  it("renders hotspot report counts", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.getByText("120")).toBeInTheDocument());
  });

  it("renders hotspot column headings for clarity", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getAllByText("dashboard.overview.table_col_location").length).toBeGreaterThan(0);
      expect(screen.getAllByText("dashboard.overview.stat_total_reports").length).toBeGreaterThan(0);
      expect(screen.getAllByText("dashboard.overview.table_col_damage").length).toBeGreaterThan(0);
    });
  });

  it("renders hotspot data in a table", async () => {
    const { container } = render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(container.querySelector('[data-slot="table"]')).not.toBeNull();
    });
  });
});

describe("DashboardOverview page — recent reports", () => {
  it("renders recent reports section heading", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() =>
      expect(screen.getByText("dashboard.overview.recent_title")).toBeInTheDocument(),
    );
  });

  it("renders view-all link to /dashboard/reports", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /recent_view_all/ });
      expect(link).toHaveAttribute("href", "/dashboard/reports");
    });
  });

  it("renders recent reports data in a shadcn table", async () => {
    const { container } = render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(container.querySelectorAll('[data-slot="table"]').length).toBeGreaterThan(1);
    });
  });

  it("uses shared dashboard data table component for overview tables", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));

    await waitFor(() => {
      expect(screen.getAllByTestId("dashboard-data-table").length).toBeGreaterThan(1);
    });
  });

  it("does not repeatedly call summary endpoint on idle re-renders", async () => {
    render(<DashboardOverviewPage />);

    await waitFor(() => {
      expect(mockSummary).toHaveBeenCalledTimes(1);
    });

    // Trigger one intentional query change via crisis selection.
    fireEvent.click(screen.getByRole("combobox", { name: /crisis_selector_label/i }));

    await waitFor(() => {
      expect(mockSummary).toHaveBeenCalledTimes(2);
    });
  });
});

describe("DashboardOverview page — a11y", () => {
  it("filter sheet trigger has an accessible name", () => {
    renderWithPendingFetch();
    expect(screen.getByRole("button", { name: "dashboard.overview.filter_label" })).toHaveAccessibleName();
  });

  it("uses all-time period on initial summary request", async () => {
    render(<DashboardOverviewPage />);

    await waitFor(() => {
      expect(mockSummary).toHaveBeenCalledWith({
        crisisId: null,
        period: "all",
      });
    });
  });

  it("does not fetch hotspots until a crisis is selected", async () => {
    render(<DashboardOverviewPage />);

    await waitFor(() => {
      expect(mockSummary).toHaveBeenCalledWith({
        crisisId: null,
        period: "all",
      });
    });

    expect(mockHotspots).not.toHaveBeenCalled();
  });

  it("submits a custom date range to the summary request", async () => {
    render(<DashboardOverviewPage />);

    fireEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_label" }));
    fireEvent.click(screen.getByRole("combobox", { name: "dashboard.overview.filter_date_range" }));
    fireEvent.click(await screen.findByRole("option", { name: "dashboard.overview.period_custom" }));
    fireEvent.change(screen.getByLabelText("dashboard.overview.filter_date_from"), {
      target: { value: "2026-03-01" },
    });
    fireEvent.change(screen.getByLabelText("dashboard.overview.filter_date_to"), {
      target: { value: "2026-03-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "dashboard.overview.filter_apply" }));
    fireEvent.click(screen.getByRole("combobox", { name: /crisis_selector_label/i }));

    await waitFor(() => {
      expect(mockSummary).toHaveBeenLastCalledWith({
        crisisId: "c1",
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      });
    });
  });

  it("stat cards use article elements for landmark structure", async () => {
    render(<DashboardOverviewPage />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() =>
      expect(screen.getAllByRole("article").length).toBeGreaterThanOrEqual(4),
    );
  });

  it("no ml-/pl-/mr-/pr- classes in rendered output (RTL compliance)", () => {
    const { container } = renderWithPendingFetch();
    const html = container.innerHTML;
    expect(html).not.toMatch(/(?:^|\s)(ml-|pl-|mr-|pr-)\d+(?:\s|$)/);
  });

  it("uses shadcn chart containers and avoids physical text alignment classes", () => {
    const { container } = renderWithPendingFetch();
    const html = container.innerHTML;
    expect(container.querySelectorAll('[data-slot="chart"]').length).toBeGreaterThan(0);
    expect(html).not.toMatch(/\btext-left\b|\btext-right\b/);
  });
});
