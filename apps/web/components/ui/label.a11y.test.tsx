import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { Label } from "./label";

expect.extend(toHaveNoViolations);

describe("Label — accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <Label htmlFor="name">Full name</Label>
        <input id="name" type="text" />
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("associates with input via htmlFor", () => {
    render(
      <div>
        <Label htmlFor="email">Email address</Label>
        <input id="email" type="email" />
      </div>,
    );
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
  });

  it("applies disabled styling when paired with a disabled input via data-disabled", () => {
    const { container } = render(
      <Label data-disabled="true">Disabled field</Label>,
    );
    expect(container.firstChild).toHaveAttribute("data-disabled", "true");
  });
});
