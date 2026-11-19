// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./select";

beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    document.body.removeAttribute("data-scroll-locked");
    document.body.style.pointerEvents = "";
});

const Fixture = ({ open, onOpenChange = () => {} }: { open?: boolean; onOpenChange?: (o: boolean) => void }) => (
    <Select open={open} onOpenChange={onOpenChange}>
        <SelectTrigger aria-label="Infrastructure type">
            <SelectValue placeholder="Choose infrastructure" />
        </SelectTrigger>
        <SelectContent>
            <SelectItem value="RESIDENTIAL">Residential</SelectItem>
            <SelectItem value="COMMERCIAL">Commercial</SelectItem>
        </SelectContent>
    </Select>
);

describe("Select", () => {
    it("renders an accessible trigger and updates value when an item is selected", async () => {
        const user = userEvent.setup();
        const onValueChange = vi.fn();

        render(
            <Select
                value="RESIDENTIAL"
                open
                onOpenChange={() => { }}
                onValueChange={onValueChange}
            >
                <SelectTrigger aria-label="Infrastructure type">
                    <SelectValue placeholder="Choose infrastructure" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="RESIDENTIAL">Residential</SelectItem>
                    <SelectItem value="COMMERCIAL">Commercial</SelectItem>
                </SelectContent>
            </Select>,
        );

        expect(
            screen.getByRole("combobox", { name: "Infrastructure type", hidden: true }),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("option", { name: "Commercial" }));
        expect(onValueChange).toHaveBeenCalledWith("COMMERCIAL");
    });

    /**
     * ROOT CAUSE of "Page is unresponsive" in Chrome:
     * A MutationObserver watching body for data-scroll-locked creates a feedback
     * loop with Radix RemoveScroll's own observer — each triggers the other,
     * saturating the main thread. The fix: never fight the lock while open.
     *
     * This test verifies body still has data-scroll-locked AFTER all async effects
     * and microtasks settle (act + setTimeout flush). With a MutationObserver
     * removing the attribute, it would be gone after flushing.
     */
    it("lets Radix manage scroll lock while open — does not remove it", async () => {
        render(<Fixture open />);

        // Flush all queued effects, microtasks and macrotasks so any MutationObserver
        // callbacks that would remove the attribute have had time to fire.
        await act(async () => {
            await new Promise<void>((resolve) => setTimeout(resolve, 50));
        });

        // Body scroll lock must still be present — our wrapper must not remove it.
        expect(document.body).toHaveAttribute("data-scroll-locked");
    });

    it("clears body scroll lock when the select closes", async () => {
        const { rerender } = render(<Fixture open />);

        await waitFor(() =>
            expect(document.body).toHaveAttribute("data-scroll-locked"),
        );

        rerender(<Fixture open={false} />);

        await waitFor(() => {
            expect(document.body).not.toHaveAttribute("data-scroll-locked");
            expect(document.body.style.pointerEvents).not.toBe("none");
        });
    });

    it("clears body scroll lock on unmount (navigation away with select open)", () => {
        const { unmount } = render(<Fixture open />);

        // Simulate Radix lock being present
        document.body.setAttribute("data-scroll-locked", "1");

        unmount();

        expect(document.body).not.toHaveAttribute("data-scroll-locked");
    });

    it("trigger has flex layout with icon aligned to end and no stray start margin on chevron", () => {
        render(<Fixture />);

        const trigger = screen.getByRole("combobox", { name: "Infrastructure type" });
        expect(trigger.className).toContain("flex");
        expect(trigger.className).toContain("justify-between");
        expect(trigger.className).toContain("items-center");

        // ChevronDown must not carry ms-* margin — justify-between handles end-alignment.
        expect(trigger.outerHTML).not.toMatch(/\bms-\d/);
    });
});
