import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { Checkbox } from "./checkbox";

expect.extend(toHaveNoViolations);

describe("Checkbox — accessibility", () => {
  it("has no axe violations when unchecked", async () => {
    const { container } = render(
      <div>
        <Checkbox id="agree" />
        <label htmlFor="agree">I agree to terms</label>
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations when checked", async () => {
    const { container } = render(
      <div>
        <Checkbox id="agree" checked onCheckedChange={() => {}} />
        <label htmlFor="agree">I agree to terms</label>
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations when disabled", async () => {
    const { container } = render(
      <div>
        <Checkbox id="agree" disabled />
        <label htmlFor="agree">I agree to terms</label>
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has correct role", () => {
    render(<Checkbox id="cb" />);
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("calls onCheckedChange when toggled", () => {
    const handler = vi.fn();
    render(<Checkbox id="cb" onCheckedChange={handler} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("shows as disabled via aria-disabled when disabled prop is set", () => {
    render(<Checkbox id="cb" disabled />);
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });
});
