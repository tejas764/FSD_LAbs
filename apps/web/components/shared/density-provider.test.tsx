// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { DensityProvider, useDensity } from "./density-provider";

function Probe() {
  const { density, setDensity } = useDensity();

  return (
    <div>
      <span data-testid="density-value">{density}</span>
      <button type="button" onClick={() => setDensity("operations")}>set-operations</button>
    </div>
  );
}

describe("DensityProvider", () => {
  it("sets data-density on wrapper", () => {
    const { container } = render(
      <DensityProvider density="field">
        <Probe />
      </DensityProvider>,
    );

    expect(container.firstElementChild).toHaveAttribute("data-density", "field");
  });

  it("updates density through context", () => {
    const { container } = render(
      <DensityProvider density="standard">
        <Probe />
      </DensityProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "set-operations" }));

    expect(screen.getByTestId("density-value")).toHaveTextContent("operations");
    expect(container.firstElementChild).toHaveAttribute("data-density", "operations");
  });
});