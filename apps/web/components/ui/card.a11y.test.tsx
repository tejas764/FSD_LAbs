import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card";

expect.extend(toHaveNoViolations);

describe("Card — accessibility", () => {
  it("has no axe violations with full composition", async () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Report #1234</CardTitle>
          <CardDescription>Submitted 2 hours ago</CardDescription>
        </CardHeader>
        <CardContent>
          <p>Main Street, Building 5</p>
        </CardContent>
        <CardFooter>
          <span>Synced</span>
        </CardFooter>
      </Card>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders title as a heading element", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Report summary</CardTitle>
        </CardHeader>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Report summary" })).toBeInTheDocument();
  });

  it("applies semantic tokens, no raw color classes", () => {
    const { container } = render(<Card className="test-card">Content</Card>);
    // Card should use bg-card, border-border — no raw gray-* classes
    expect(container.firstChild).not.toHaveClass("bg-white");
    expect(container.firstChild).not.toHaveClass("bg-gray-100");
  });
});
