import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { SkipLink } from "./skip-link";

expect.extend(toHaveNoViolations);

const LABEL = "Skip to main content";

describe("SkipLink — accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <SkipLink label={LABEL} />
        <main id="main-content">Content</main>
      </div>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders an anchor element", () => {
    render(<SkipLink label={LABEL} />);
    expect(screen.getByRole("link").tagName).toBe("A");
  });

  it("points to #main-content by default", () => {
    render(<SkipLink label={LABEL} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "#main-content");
  });

  it("has accessible name describing its purpose", () => {
    render(<SkipLink label={LABEL} />);
    expect(screen.getByRole("link", { name: LABEL })).toBeInTheDocument();
  });

  it("is the first focusable element when placed before other interactive content", () => {
    const { container } = render(
      <div>
        <SkipLink label={LABEL} />
        <nav>
          <a href="/home">Home</a>
        </nav>
        <main id="main-content">
          <button>Report damage</button>
        </main>
      </div>,
    );
    const focusable = container.querySelectorAll<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
    );
    expect(focusable[0]).toBe(screen.getByRole("link", { name: /skip/i }));
  });

  it("gains a visible class on focus (className differs from unfocused state)", () => {
    render(<SkipLink label={LABEL} />);
    const link = screen.getByRole("link");
    const unfocusedClass = link.className;
    fireEvent.focus(link);
    expect(link.className).not.toBe(unfocusedClass);
  });

  it("returns to hidden state on blur", () => {
    render(<SkipLink label={LABEL} />);
    const link = screen.getByRole("link");
    const unfocusedClass = link.className;
    fireEvent.focus(link);
    fireEvent.blur(link);
    expect(link.className).toBe(unfocusedClass);
  });
});
