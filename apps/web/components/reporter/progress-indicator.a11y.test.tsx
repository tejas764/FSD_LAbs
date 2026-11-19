import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { ProgressIndicator } from "./progress-indicator";

expect.extend(toHaveNoViolations);

const STEPS = ["Photo", "Damage", "Location", "Confirm"];

describe("ProgressIndicator — accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <ProgressIndicator steps={STEPS} currentStep={0} />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders a <nav> element", () => {
    render(<ProgressIndicator steps={STEPS} currentStep={0} />);
    expect(screen.getByRole("navigation")).toBeInTheDocument();
  });

  it("nav has aria-label='Submission steps'", () => {
    render(<ProgressIndicator steps={STEPS} currentStep={0} />);
    expect(
      screen.getByRole("navigation", { name: "Submission steps" }),
    ).toBeInTheDocument();
  });

  it("current step element has aria-current='step'", () => {
    render(<ProgressIndicator steps={STEPS} currentStep={1} />);
    expect(screen.getByText("Damage")).toHaveAttribute("aria-current", "step");
  });

  it("non-current steps do not carry aria-current='step'", () => {
    render(<ProgressIndicator steps={STEPS} currentStep={1} />);
    expect(screen.getByText("Photo")).not.toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("every step label is visible text in the DOM", () => {
    render(<ProgressIndicator steps={STEPS} currentStep={0} />);
    STEPS.forEach((step) => {
      expect(screen.getByText(step)).toBeVisible();
    });
  });
});
