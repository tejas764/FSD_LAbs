// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders children", () => {
    render(<Badge>3</Badge>);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("forwards className", () => {
    render(<Badge className="custom-cls">test</Badge>);
    expect(screen.getByText("test")).toHaveClass("custom-cls");
  });

  it("renders secondary variant by default", () => {
    render(<Badge>0</Badge>);
    expect(screen.getByText("0").tagName).toBe("SPAN");
  });
});
