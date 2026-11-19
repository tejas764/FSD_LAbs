// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Polyfills required by Radix Popover + cmdk in jsdom
beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    if (typeof window.ResizeObserver === "undefined") {
        window.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
});

afterEach(() => {
    document.body.removeAttribute("data-scroll-locked");
    document.body.style.pointerEvents = "";
});

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        crises: {
            list: vi.fn().mockResolvedValue([
                {
                    id: "crisis-1",
                    name: "Flood Western Region",
                    type: "FLOOD",
                    country: "Nepal",
                    region: null,
                    startedAt: "2026-04-01T00:00:00Z",
                    isActive: true,
                    extentBBox: [80.0, 26.0, 88.0, 30.0],
                    createdAt: "2026-04-01T00:00:00Z",
                    updatedAt: "2026-04-01T00:00:00Z",
                },
                {
                    id: "crisis-2",
                    name: "Earthquake South",
                    type: "EARTHQUAKE",
                    country: "Pakistan",
                    region: null,
                    startedAt: "2026-03-15T00:00:00Z",
                    isActive: true,
                    extentBBox: null,
                    createdAt: "2026-03-15T00:00:00Z",
                    updatedAt: "2026-03-15T00:00:00Z",
                },
            ]),
        },
    },
}));

import { CrisisSelector } from "./crisis-selector";

describe("CrisisSelector", () => {
    const onSelect = vi.fn();

    beforeEach(() => {
        onSelect.mockClear();
    });

    it("shows loading state initially", () => {
        render(<CrisisSelector selectedId={null} onSelect={onSelect} />);
        expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("shows combobox trigger after crises load", async () => {
        render(<CrisisSelector selectedId={null} onSelect={onSelect} />);
        await waitFor(() => {
            expect(screen.getByRole("combobox")).toBeInTheDocument();
        });
    });

    it("shows placeholder text when no crisis selected", async () => {
        render(<CrisisSelector selectedId={null} onSelect={onSelect} />);
        await waitFor(() => {
            expect(
                screen.getByText("reporter.map.crisis_selector_placeholder"),
            ).toBeInTheDocument();
        });
    });

    it("shows selected crisis name in trigger button", async () => {
        render(<CrisisSelector selectedId="crisis-1" onSelect={onSelect} />);
        await waitFor(() => {
            expect(screen.getByRole("combobox")).toHaveTextContent("Flood Western Region");
        });
    });

    it("shows selected crisis country alongside name in trigger", async () => {
        render(<CrisisSelector selectedId="crisis-1" onSelect={onSelect} />);
        await waitFor(() => {
            expect(screen.getByRole("combobox")).toHaveTextContent("Nepal");
        });
    });

    it("renders crisis options grouped by country in popover", async () => {
        const user = userEvent.setup();
        render(<CrisisSelector selectedId={null} onSelect={onSelect} />);
        await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

        await act(async () => {
            await user.click(screen.getByRole("combobox"));
        });

        // Country group headings
        expect(screen.getByText("Nepal")).toBeInTheDocument();
        expect(screen.getByText("Pakistan")).toBeInTheDocument();
        // Crisis items inside their groups
        expect(screen.getByText("Flood Western Region")).toBeInTheDocument();
        expect(screen.getByText("Earthquake South")).toBeInTheDocument();
    });

    it("calls onSelect with crisis id when item chosen", async () => {
        const user = userEvent.setup();
        render(<CrisisSelector selectedId={null} onSelect={onSelect} />);
        await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

        await act(async () => {
            await user.click(screen.getByRole("combobox"));
        });
        await act(async () => {
            await user.click(screen.getByText("Earthquake South"));
        });
        expect(onSelect).toHaveBeenCalledWith("crisis-2");
    });

    it("calls onSelect(null) when clear button clicked", async () => {
        const user = userEvent.setup();
        render(<CrisisSelector selectedId="crisis-1" onSelect={onSelect} />);
        await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

        const clearBtn = screen.getByRole("button", {
            name: "reporter.map.crisis_selector_clear",
        });
        await act(async () => {
            await user.click(clearBtn);
        });
        expect(onSelect).toHaveBeenCalledWith(null);
    });
});
