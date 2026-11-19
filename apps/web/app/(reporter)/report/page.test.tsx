// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/reporter/reporter-wizard", () => ({
  ReporterWizard: () => <div data-testid="reporter-wizard" />,
}));

import ReportPage from "./page";

describe("Reporter report page", () => {
  it("renders reporter wizard shell", () => {
    render(<ReportPage />);
    expect(screen.getByTestId("reporter-wizard")).toBeInTheDocument();
  });
});
