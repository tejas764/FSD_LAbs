import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

import { LanguageSwitcher } from "./language-switcher";

expect.extend(toHaveNoViolations);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("LanguageSwitcher a11y", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <LanguageSwitcher currentLanguage="en" onLanguageChange={() => {}} />,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});