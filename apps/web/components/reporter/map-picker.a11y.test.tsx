import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

// Mock next/dynamic so the Leaflet component renders synchronously in jsdom.
// The mock provides testid + aria attributes so axe does not flag the element.
vi.mock("next/dynamic", () => ({
  default: (
    _importFn: unknown,
  ): React.ComponentType<{
    onSelect: (c: { lat: number; lon: number }) => void;
  }> =>
    function MockLeafletMap({ onSelect }) {
      return (
        <button
          type="button"
          aria-label="Interactive map"
          data-testid="map-surface"
          style={{ width: "100%", height: "300px" }}
          onClick={() => onSelect({ lat: 10, lon: 20 })}
        />
      );
    },
}));

import { MapPicker } from "./map-picker";

expect.extend(toHaveNoViolations);

describe("MapPicker — accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(<MapPicker onSelect={vi.fn()} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders the map container with role='application'", () => {
    render(<MapPicker onSelect={vi.fn()} />);
    expect(screen.getByRole("application")).toBeInTheDocument();
  });

  it("includes a visible text input fallback in the DOM", () => {
    render(<MapPicker onSelect={vi.fn()} />);
    const input = screen.getByRole("textbox");
    expect(input).toBeVisible();
  });

  it("provides a visible label for the text input fallback", () => {
    render(<MapPicker onSelect={vi.fn()} />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAccessibleName();
  });

  it("includes keyboard instructions accessible to screen-reader users", () => {
    render(<MapPicker onSelect={vi.fn()} />);
    // The application landmark must describe how keyboard users interact with it
    expect(screen.getByRole("application")).toHaveAccessibleDescription();
  });

  it("calls onSelect with parsed coordinates when text input is submitted via Enter", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "48.8566, 2.3522" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ lat: 48.8566, lon: 2.3522 });
  });

  it("calls onSelect when user clicks the map surface", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    fireEvent.click(screen.getByTestId("map-surface"));

    expect(onSelect).toHaveBeenCalledWith({ lat: 10, lon: 20 });
  });

  it("updates coordinate input when map fires onSelect", () => {
    render(<MapPicker onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTestId("map-surface"));

    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("10.000000, 20.000000");
  });

  it("renders a visible full-width map surface", () => {
    render(<MapPicker onSelect={vi.fn()} />);

    const mapSurface = screen.getByTestId("map-surface");
    expect(mapSurface).toHaveStyle({ height: "300px" });
    expect(mapSurface).toBeVisible();
  });
});
