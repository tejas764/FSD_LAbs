// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MapPicker } from "./map-picker";

// Mock Leaflet map component
vi.mock("./leaflet-map", () => ({
  default: ({
    onSelect,
  }: {
    onSelect: (coords: { lat: number; lon: number }) => void;
  }) => (
    <div data-testid="leaflet-map">
      <button onClick={() => onSelect({ lat: 34.0522, lon: -118.2437 })}>
        Click Map
      </button>
    </div>
  ),
}));

describe("MapPicker — coordinate validation", () => {
  it("rejects non-numeric longitude input", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "3.528458, xxx" } });

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("rejects out-of-range longitude (> 180)", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "3.528458, 999999" } });

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("rejects out-of-range longitude (< -180)", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "3.528458, -999999" } });

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("rejects out-of-range latitude (> 90)", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "999, 120.5" } });

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("rejects out-of-range latitude (< -90)", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "-999, 120.5" } });

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("accepts valid coordinates within range", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "34.0522, -118.2437" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith({ lat: 34.0522, lon: -118.2437 });
  });

  it("accepts edge case latitude values (-90, +90)", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");

    // Test -90
    fireEvent.change(input, { target: { value: "-90, 0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ lat: -90, lon: 0 });

    // Test +90
    fireEvent.change(input, { target: { value: "90, 0" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ lat: 90, lon: 0 });
  });

  it("accepts edge case longitude values (-180, +180)", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");

    // Test -180
    fireEvent.change(input, { target: { value: "0, -180" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ lat: 0, lon: -180 });

    // Test +180
    fireEvent.change(input, { target: { value: "0, 180" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ lat: 0, lon: 180 });
  });

  it("shows error message for invalid coordinate input", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "999, 999" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("clears error message when valid coordinates are entered", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");

    // Enter invalid coordinates
    fireEvent.change(input, { target: { value: "999, 999" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Enter valid coordinates
    fireEvent.change(input, { target: { value: "34.0522, -118.2437" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("invalidates coordinates when user types invalid text without pressing Enter", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");

    // User enters valid coordinates first
    fireEvent.change(input, { target: { value: "34.0522, -118.2437" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ lat: 34.0522, lon: -118.2437 });
    onSelect.mockClear();

    // User types invalid text but doesn't press Enter
    fireEvent.change(input, { target: { value: "999, 999" } });

    // Should call onSelect with null to invalidate previous coordinates
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("invalidates coordinates when user types non-numeric text", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const input = screen.getByRole("textbox");

    // User enters valid coordinates first
    fireEvent.change(input, { target: { value: "34.0522, -118.2437" } });
    fireEvent.keyDown(input, { key: "Enter" });
    onSelect.mockClear();

    // User types invalid text
    fireEvent.change(input, { target: { value: "3.528458, xxx" } });

    // Should invalidate
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});

describe("MapPicker — map container stacking context", () => {
  it("wraps the map in an isolated stacking context to prevent z-index overlap with fixed nav", () => {
    const onSelect = vi.fn();
    render(<MapPicker onSelect={onSelect} />);

    const mapContainer = screen.getByTestId("map-container");
    expect(mapContainer.className).toContain("isolate");
  });
});
