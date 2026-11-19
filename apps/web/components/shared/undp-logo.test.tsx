// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { UndpLogo } from "./undp-logo";

describe("UndpLogo", () => {
    it("renders the official logo image source", () => {
        const { container } = render(<UndpLogo className="h-7 w-auto" />);

        const logo = container.querySelector("img");
        expect(logo).not.toBeNull();
        expect(logo).toHaveAttribute(
            "src",
            "https://www.undp.org/sites/g/files/zskgke326/files/2022-04/undp-logo-white.svg",
        );
        expect(logo).toHaveAttribute("alt", "");
        expect(logo).toHaveAttribute("aria-hidden", "true");
        expect(logo).toHaveAttribute("dir", "ltr");
    });
});