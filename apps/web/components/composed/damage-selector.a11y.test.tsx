import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { DamageSelector } from "./damage-selector";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("DamageSelector accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <DamageSelector value={null} onChange={vi.fn()} />,
    );
    const results = await axe(container);
    expect(results.violations).toHaveLength(0);
  });
});
