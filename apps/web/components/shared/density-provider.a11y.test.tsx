import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

import { DensityProvider } from "./density-provider";

expect.extend(toHaveNoViolations);

describe("DensityProvider a11y", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <DensityProvider density="field">
        <main id="main-content">content</main>
      </DensityProvider>,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});