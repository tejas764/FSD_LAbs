// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CountryCodeSelect } from "./country-code-select";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: "en" },
    }),
}));

vi.mock("@/lib/api/crises-utils", () => ({
    getCountryName: (code: string) => ({
        NP: "Nepal",
        US: "United States",
    }[code] ?? code),
}));

describe("CountryCodeSelect", () => {
    const originalSupportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;

    beforeAll(() => {
        window.HTMLElement.prototype.scrollIntoView = vi.fn();
        if (!window.HTMLElement.prototype.hasPointerCapture) {
            window.HTMLElement.prototype.hasPointerCapture = vi.fn();
        }
        if (!window.HTMLElement.prototype.setPointerCapture) {
            window.HTMLElement.prototype.setPointerCapture = vi.fn();
        }
        if (!window.HTMLElement.prototype.releasePointerCapture) {
            window.HTMLElement.prototype.releasePointerCapture = vi.fn();
        }
    });

    beforeEach(() => {
        (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf =
            vi.fn((key: string) => (key === "region" ? ["NP", "US"] : []));
    });

    it("renders country options with flag emoji and ISO code", async () => {
        const user = userEvent.setup();
        render(
            <CountryCodeSelect
                id="country"
                value=""
                ariaLabel="dashboard.crises.form.country"
                placeholder="dashboard.crises.form.country_placeholder"
                onChange={vi.fn()}
            />,
        );

        await user.click(screen.getByRole("combobox", { name: "dashboard.crises.form.country" }));

        expect(screen.getByRole("option", { name: "🇳🇵 Nepal (NP)" })).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "🇺🇸 United States (US)" })).toBeInTheDocument();
    });

    // restore global after test file execution
    afterAll(() => {
        (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf = originalSupportedValuesOf;
    });
});
