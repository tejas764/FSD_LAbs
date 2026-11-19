import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { Alert, AlertTitle, AlertDescription } from "./alert";

expect.extend(toHaveNoViolations);

describe("Alert — accessibility", () => {
  it("has no axe violations (default/info variant)", async () => {
    const { container } = render(
      <Alert>
        <AlertTitle>Connection restored</AlertTitle>
        <AlertDescription>Your reports are being uploaded.</AlertDescription>
      </Alert>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations (destructive variant)", async () => {
    const { container } = render(
      <Alert variant="destructive">
        <AlertTitle>Upload failed</AlertTitle>
        <AlertDescription>Check your connection and retry.</AlertDescription>
      </Alert>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has role='alert' in destructive variant", () => {
    render(
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
      </Alert>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders AlertTitle and AlertDescription", () => {
    render(
      <Alert>
        <AlertTitle>Title text</AlertTitle>
        <AlertDescription>Description text</AlertDescription>
      </Alert>,
    );
    expect(screen.getByText("Title text")).toBeInTheDocument();
    expect(screen.getByText("Description text")).toBeInTheDocument();
  });
});
