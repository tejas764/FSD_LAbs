// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CrisisSearch } from "./crisis-search";

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        crises: {
            list: vi.fn().mockResolvedValue([]),
        },
    },
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: "en" },
    }),
}));

const { apiClient } = await import("@/lib/api/client");

const mockCrises = [
    { id: "c-1", name: "Syria Earthquake", country: "SY", isActive: true, type: "EARTHQUAKE", startedAt: "2024-01-01T00:00:00Z", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", extentBBox: null },
    { id: "c-2", name: "Iraq Flood", country: "IQ", isActive: true, type: "FLOOD", startedAt: "2024-02-01T00:00:00Z", createdAt: "2024-02-01T00:00:00Z", updatedAt: "2024-02-01T00:00:00Z", extentBBox: null },
];

beforeEach(() => {
    vi.clearAllMocks();
    (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    Element.prototype.scrollIntoView = vi.fn();
});

// Helper: open the popover by clicking the combobox trigger
async function openPopover() {
    const user = userEvent.setup();
    const trigger = screen.getByRole("combobox");
    await act(async () => { await user.click(trigger); });
    return trigger;
}

describe("CrisisSearch — trigger", () => {
    it("renders a button with combobox role", () => {
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        expect(screen.getByRole("combobox")).toBeInTheDocument();
        expect(screen.getByRole("combobox").tagName).toBe("BUTTON");
    });

    it("trigger has an accessible label", () => {
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        expect(screen.getByRole("combobox")).toHaveAccessibleName();
    });

    it("trigger has aria-expanded=false when closed", () => {
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
    });

    it("trigger has aria-expanded=true after clicking to open", async () => {
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        await openPopover();
        // When open, both the Button trigger and CommandInput have role="combobox".
        // The trigger button is identified by its aria-label.
        const trigger = screen.getByRole("combobox", {
            name: "reporter.wizard.fields.crisis",
        });
        expect(trigger).toHaveAttribute("aria-expanded", "true");
    });

    it("shows placeholder text when no crisis is selected", async () => {
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        // Wait for initial load to complete (loading → false) before checking placeholder
        await waitFor(() =>
            expect(screen.getByRole("combobox")).toHaveTextContent(
                "reporter.wizard.fields.crisis_placeholder",
            ),
        );
    });

    it("shows selected crisis name and country in trigger when value provided", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        render(<CrisisSearch value="c-2" onChange={vi.fn()} />);
        await waitFor(() => {
            expect(screen.getByRole("combobox")).toHaveTextContent("Iraq Flood");
            // Intl.DisplayNames("en").of("IQ") → "Iraq"
            expect(screen.getByRole("combobox")).toHaveTextContent("Iraq");
        });
    });

    it("renders a chevron icon in the trigger", () => {
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        const trigger = screen.getByRole("combobox");
        expect(trigger.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    });
});

describe("CrisisSearch — API calls", () => {
    it("queries the API on mount with empty string", async () => {
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        await waitFor(() =>
            expect(apiClient.crises.list).toHaveBeenCalledWith(
                true,
                expect.objectContaining({ q: "", take: 50 }),
            ),
        );
    });

    it("debounces API queries by 300ms when typing in the search input", async () => {
        vi.useFakeTimers();
        try {
            (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
            render(<CrisisSearch value="" onChange={vi.fn()} />);
            // Flush initial mount API call
            await act(() => vi.runAllTimersAsync());

            // Open popover and flush the resulting re-search
            fireEvent.click(screen.getByRole("combobox"));
            await act(() => vi.runAllTimersAsync());

            // Now clear mocks — start counting from zero
            vi.clearAllMocks();
            (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

            const searchInput = screen.getByPlaceholderText(
                "reporter.wizard.fields.crisis_placeholder",
            );

            // Rapid keystrokes
            fireEvent.change(searchInput, { target: { value: "Sy" } });
            fireEvent.change(searchInput, { target: { value: "Syr" } });
            fireEvent.change(searchInput, { target: { value: "Syria" } });
            // Debounce not elapsed — no API call yet
            expect(apiClient.crises.list).not.toHaveBeenCalled();

            await act(() => vi.advanceTimersByTimeAsync(300));
            expect(apiClient.crises.list).toHaveBeenCalledTimes(1);
            expect(apiClient.crises.list).toHaveBeenCalledWith(
                true,
                expect.objectContaining({ q: "Syria", take: 50 }),
            );
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("CrisisSearch — popover / results", () => {
    it("shows a listbox with crisis options after opening", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        await openPopover();
        await waitFor(() => {
            expect(screen.getByRole("listbox")).toBeInTheDocument();
            expect(screen.getByRole("option", { name: /Syria Earthquake/i })).toBeInTheDocument();
            expect(screen.getByRole("option", { name: /Iraq Flood/i })).toBeInTheDocument();
        });
    });

    it("shows empty state message when no crises match", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        await openPopover();
        await waitFor(() =>
            expect(
                screen.getByText("reporter.map.crisis_no_results"),
            ).toBeInTheDocument(),
        );
    });

    it("calls onChange with the crisis id when an option is selected", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        const onChange = vi.fn();
        render(<CrisisSearch value="" onChange={onChange} />);
        await openPopover();
        await waitFor(() =>
            expect(screen.getByRole("option", { name: /Syria Earthquake/i })).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByRole("option", { name: /Syria Earthquake/i }));
        expect(onChange).toHaveBeenCalledWith("c-1");
    });

    it("calls onSelect with the crisis object when option is selected", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        const onSelect = vi.fn();
        render(<CrisisSearch value="" onChange={vi.fn()} onSelect={onSelect} />);
        await openPopover();
        await waitFor(() =>
            expect(screen.getByRole("option", { name: /Iraq Flood/i })).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByRole("option", { name: /Iraq Flood/i }));
        expect(onSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: "c-2", name: "Iraq Flood" }),
        );
    });

    it("closes the popover after selecting an option", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        await openPopover();
        await waitFor(() =>
            expect(screen.getByRole("option", { name: /Syria Earthquake/i })).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByRole("option", { name: /Syria Earthquake/i }));
        await waitFor(() =>
            expect(screen.queryByRole("listbox")).not.toBeInTheDocument(),
        );
    });

    it("shows a check mark on the currently selected option", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        render(<CrisisSearch value="c-1" onChange={vi.fn()} />);
        await openPopover();
        await waitFor(() =>
            expect(screen.getByRole("option", { name: /Syria Earthquake/i })).toBeInTheDocument(),
        );
        const selectedOption = screen.getByRole("option", { name: /Syria Earthquake/i });
        const checkIcon = selectedOption.querySelector("svg[aria-hidden='true']");
        expect(checkIcon).toHaveClass("opacity-100");
    });
});

describe("CrisisSearch — country name display", () => {
    it("shows country display name as secondary text in each option", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        await openPopover();
        await waitFor(() => {
            // Intl.DisplayNames("en").of("SY") → "Syria"
            const syOpt = screen.getByRole("option", { name: /Syria Earthquake/i });
            expect(syOpt).toHaveTextContent("Syria");
            // Intl.DisplayNames("en").of("IQ") → "Iraq"
            const iqOpt = screen.getByRole("option", { name: /Iraq Flood/i });
            expect(iqOpt).toHaveTextContent("Iraq");
        });
    });

    it("filters options by country name when user types a country", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        render(<CrisisSearch value="" onChange={vi.fn()} />);
        await openPopover();
        await waitFor(() => expect(screen.getByRole("listbox")).toBeInTheDocument());

        vi.clearAllMocks();
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

        const searchInput = screen.getByPlaceholderText(
            "reporter.wizard.fields.crisis_placeholder",
        );
        fireEvent.change(searchInput, { target: { value: "Iraq" } });
        await waitFor(() => {
            expect(screen.getByRole("option", { name: /Iraq Flood/i })).toBeInTheDocument();
            expect(
                screen.queryByRole("option", { name: /Syria Earthquake/i }),
            ).not.toBeInTheDocument();
        });
    });
});

describe("CrisisSearch — location-aware (coords prop)", () => {
    const coords = { lat: 36.2, lng: 37.1 };

    it("passes reporter coords to API on initial load", async () => {
        render(<CrisisSearch value="" onChange={vi.fn()} coords={coords} />);
        await waitFor(() =>
            expect(apiClient.crises.list).toHaveBeenCalledWith(
                true,
                expect.objectContaining({ lat: 36.2, lng: 37.1 }),
            ),
        );
    });

    it("does NOT pass coords when user types (global search)", async () => {
        vi.useFakeTimers();
        try {
            render(<CrisisSearch value="" onChange={vi.fn()} coords={coords} />);
            await act(() => vi.runAllTimersAsync()); // flush initial location search

            // Open popover and flush the resulting re-search
            fireEvent.click(screen.getByRole("combobox"));
            await act(() => vi.runAllTimersAsync());

            vi.clearAllMocks();
            (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);

            const searchInput = screen.getByPlaceholderText(
                "reporter.wizard.fields.crisis_placeholder",
            );
            fireEvent.change(searchInput, { target: { value: "Syria" } });
            await act(() => vi.advanceTimersByTimeAsync(300));
            expect(apiClient.crises.list).toHaveBeenCalledWith(
                true,
                expect.not.objectContaining({ lat: 36.2 }),
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it("shows near-location hint when coords provided and API returns results", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        render(<CrisisSearch value="" onChange={vi.fn()} coords={coords} />);
        await waitFor(() =>
            expect(
                screen.getByText("reporter.wizard.fields.crisis_near_location"),
            ).toBeInTheDocument(),
        );
    });

    it("hides near-location hint when popover is open", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrises);
        render(<CrisisSearch value="" onChange={vi.fn()} coords={coords} />);
        await waitFor(() =>
            expect(
                screen.getByText("reporter.wizard.fields.crisis_near_location"),
            ).toBeInTheDocument(),
        );
        await openPopover();
        expect(
            screen.queryByText("reporter.wizard.fields.crisis_near_location"),
        ).not.toBeInTheDocument();
    });

    it("falls back to all crises when location-filtered result is empty", async () => {
        (apiClient.crises.list as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce([])          // location-filtered → 0 results
            .mockResolvedValue(mockCrises);     // fallback → all crises

        render(<CrisisSearch value="" onChange={vi.fn()} coords={coords} />);
        await waitFor(() =>
            expect(apiClient.crises.list).toHaveBeenCalledWith(
                true,
                expect.not.objectContaining({ lat: expect.anything() }),
            ),
        );
    });
});
