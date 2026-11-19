// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

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

describe("Report success page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsGetMock.mockImplementation((key: string) => {
      if (key === "reportId") return "report-1";
      if (key === "status") return "synced";
      if (key === "reporterId") return "anon-1";
      if (key === "crisisId") return "crisis-1";
      if (key === "offline") return null;
      return null;
    });
  });

  it("shows success card and online impact section", async () => {
    profileMock.mockResolvedValue({
      success: true,
      data: {
        reporterId: "anon-1",
        reportCount: 2,
        badgeLevel: "silver",
        lastActiveAt: "2026-04-06T00:00:00.000Z",
      },
    });
    hotspotsMock.mockResolvedValue({
      success: true,
      data: [
        {
          h3Index: "abc",
          centerLat: 0,
          centerLng: 0,
          count: 3,
          avgDamageLevel: 2,
        },
      ],
    });

    render(<SuccessPage />);

    expect(
      await screen.findByText("reporter.success.title"),
    ).toBeInTheDocument();
    // Report ID is now shown in a <code> element
    const refEl = document.querySelector("[data-testid='report-reference']");
    expect(refEl?.textContent?.trim()).toContain("report-1");
    expect(
      screen.getAllByText(/reporter\.success\.impact_count/).length,
    ).toBeGreaterThan(0);
  });

  it("skips impact section when offline", async () => {
    searchParamsGetMock.mockImplementation((key: string) => {
      if (key === "reportId") return "local-1";
      if (key === "status") return "queued";
      if (key === "offline") return "1";
      return null;
    });

    render(<SuccessPage />);

    expect(
      await screen.findByText("reporter.success.title"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("reporter.success.impact_title"),
    ).not.toBeInTheDocument();
  });

  it("shows first_time_guidance when reportCount is 1", async () => {
    profileMock.mockResolvedValue({
      success: true,
      data: { reporterId: "anon-1", reportCount: 1, badgeLevel: null, lastActiveAt: "" },
    });

    render(<SuccessPage />);

    expect(
      await screen.findByText("reporter.success.first_time_guidance"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("reporter.success.returning_coverage"),
    ).not.toBeInTheDocument();
  });

  it("shows returning_coverage when reportCount is greater than 1", async () => {
    profileMock.mockResolvedValue({
      success: true,
      data: { reporterId: "anon-1", reportCount: 3, badgeLevel: null, lastActiveAt: "" },
    });

    render(<SuccessPage />);

    expect(
      await screen.findByText("reporter.success.returning_coverage"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("reporter.success.first_time_guidance"),
    ).not.toBeInTheDocument();
  });

  it("always shows follow_up_prompt in the impact section", async () => {
    render(<SuccessPage />);

    expect(
      await screen.findByText("reporter.success.follow_up_prompt"),
    ).toBeInTheDocument();
  });

  it("does not show gamification text (badges/points/rankings)", async () => {
    profileMock.mockResolvedValue({
      success: true,
      data: { reporterId: "anon-1", reportCount: 2, badgeLevel: "CONTRIBUTOR", lastActiveAt: "" },
    });

    const { container } = render(<SuccessPage />);
    await screen.findByText("reporter.success.title");

    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/points|leaderboard|ranking/);
    expect(screen.getByText("reporter.success.status_title")).toBeInTheDocument();
  });

  it("shows a contribution status card with the current trust tier and next milestone", async () => {
    profileMock.mockResolvedValue({
      success: true,
      data: { reporterId: "anon-1", reportCount: 2, badgeLevel: "CONTRIBUTOR", lastActiveAt: "" },
    });

    render(<SuccessPage />);

    expect(await screen.findByText("reporter.success.status_title")).toBeInTheDocument();
    expect(screen.getByText("reporter.badge.contributor")).toBeInTheDocument();
    expect(screen.getByText(/reporter\.success\.next_milestone/)).toBeInTheDocument();
  });

  it("renders a visual success hero icon for clearer hierarchy", async () => {
    render(<SuccessPage />);

    expect(
      await screen.findByTestId("success-hero-icon"),
    ).toBeInTheDocument();
  });

  it("report reference number is displayed in a monospace element", async () => {
    render(<SuccessPage />);
    await screen.findByText("reporter.success.title");

    const refEl = document.querySelector("[data-testid='report-reference']");
    expect(refEl).not.toBeNull();
    expect(refEl?.tagName).toBe("CODE");
  });

  it("'Return to map' link stretches full width (w-full class)", async () => {
    render(<SuccessPage />);
    await screen.findByText("reporter.success.title");

    const returnLink = screen.getByRole("link", { name: "reporter.success.return_to_map" });
    expect(returnLink.className).toContain("w-full");
  });

  it("renders success action buttons in a 2-column layout", async () => {
    render(<SuccessPage />);
    await screen.findByText("reporter.success.title");

    const returnLink = screen.getByRole("link", { name: "reporter.success.return_to_map" });
    const submitAnotherLink = screen.getByRole("link", { name: "reporter.success.submit_another" });
    const actionsWrapper = returnLink.parentElement;

    expect(actionsWrapper).not.toBeNull();
    expect(actionsWrapper).toBe(submitAnotherLink.parentElement);
    expect(actionsWrapper?.className).toContain("grid");
    expect(actionsWrapper?.className).toContain("grid-cols-2");
  });

  it("impact section shows a star/award icon when reportCount is 1+", async () => {
    profileMock.mockResolvedValue({
      success: true,
      data: { reporterId: "anon-1", reportCount: 2, badgeLevel: null, lastActiveAt: "" },
    });

    render(<SuccessPage />);
    await screen.findByText("reporter.success.impact_title");

    // Impact card must include a lucide icon element
    const impactSection = document.querySelector("[aria-labelledby='impact-heading']");
    expect(impactSection?.querySelector("svg")).not.toBeNull();
  });
});
