// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";

const mockSetTheme = vi.fn();
let mockTheme = "light";

vi.mock("@/components/shared/theme-provider", () => ({
    useTheme: () => ({ theme: mockTheme, setTheme: mockSetTheme, resolvedTheme: mockTheme }),
}));

vi.mock("@/components/ui/tooltip", () => ({
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children, asChild: _asChild }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
    TooltipContent: () => null,
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
    it("renders a button with accessible label", () => {
        render(<ThemeToggle />);
        expect(screen.getByRole("button")).toBeInTheDocument();
        expect(screen.getByRole("button").getAttribute("aria-label")).toBeTruthy();
    });

    it("calls setTheme with 'dark' when current theme is light", () => {
        mockTheme = "light";
        render(<ThemeToggle />);
        fireEvent.click(screen.getByRole("button"));
        expect(mockSetTheme).toHaveBeenCalledWith("dark");
    });

    it("calls setTheme with 'light' when current theme is dark", () => {
        mockTheme = "dark";
        render(<ThemeToggle />);
        fireEvent.click(screen.getByRole("button"));
        expect(mockSetTheme).toHaveBeenCalledWith("light");
    });

    it("has aria-pressed reflecting current theme state", () => {
        mockTheme = "dark";
        render(<ThemeToggle />);
        // dark mode is "pressed" (active)
        expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
    });

    it("icon has aria-hidden=true", () => {
        render(<ThemeToggle />);
        const svg = document.querySelector("svg");
        expect(svg?.getAttribute("aria-hidden")).toBe("true");
    });
});
