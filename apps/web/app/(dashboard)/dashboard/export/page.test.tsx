// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { exportSpy, exportStatusSpy } = vi.hoisted(() => ({
    exportSpy: vi.fn(),
    exportStatusSpy: vi.fn(),
}));

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { dir: () => "ltr" },
    }),
}));

const { getCrisisByIdSpy } = vi.hoisted(() => ({
    getCrisisByIdSpy: vi.fn(),
}));

const { useSessionSpy } = vi.hoisted(() => ({
    useSessionSpy: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
    useSession: useSessionSpy,
}));

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        reports: {
            export: exportSpy,
            exportStatus: exportStatusSpy,
        },
        crises: {
            getById: getCrisisByIdSpy,
        },
    },
}));

vi.mock("@/components/composed/export-viewport-map", () => ({
    ExportViewportMap: ({
        onBoundsChange,
        fitBounds,
    }: {
        onBoundsChange: (bounds: string) => void;
        fitBounds?: [number, number, number, number] | null;
    }) => (
        <div data-testid="export-viewport-map">
            <button type="button" onClick={() => onBoundsChange("5,110,10,120")}>emit-viewport</button>
            <button type="button" onClick={() => onBoundsChange("6,111,11,121")}>emit-viewport-next</button>
            <output data-testid="fit-bounds">{fitBounds ? fitBounds.join(",") : "none"}</output>
        </div>
    ),
}));

vi.mock("@/components/composed/crisis-selector", () => ({
    CrisisSelector: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) => (
        <div>
            <button
                role="combobox"
                aria-label="dashboard.map.crisis_selector_label"
                aria-controls="export-crisis-selector-listbox"
                aria-expanded="false"
                onClick={() => onSelect("c1")}
            >
                {selectedId ?? "none"}
            </button>
            <button
                type="button"
                aria-label="dashboard.map.select_crisis_c2"
                onClick={() => onSelect("c2")}
            >
                c2
            </button>
        </div>
    ),
}));

import DashboardExportPage from "./page";

describe("Dashboard export page", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useRealTimers();
        useSessionSpy.mockReturnValue({
            data: {
                user: {
                    role: "ANALYST",
                },
            },
        });
        exportSpy.mockResolvedValue({ jobId: "job-1" });
        exportStatusSpy.mockResolvedValue({
            jobId: "job-1",
            status: "queued",
        });
        getCrisisByIdSpy.mockImplementation(async (id: string) => {
            if (id === "c2") {
                return {
                    id: "c2",
                    name: "Crisis 2",
                    type: "FLOOD",
                    country: "AF",
                    region: null,
                    startedAt: "2026-01-01T00:00:00.000Z",
                    isActive: true,
                    extentBBox: null,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                };
            }

            return {
                id: "c1",
                name: "Crisis 1",
                type: "FLOOD",
                country: "AF",
                region: null,
                startedAt: "2026-01-01T00:00:00.000Z",
                isActive: true,
                extentBBox: [34.7, 31.5, 35.9, 33],
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
            };
        });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("requires crisis selection for analyst users", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        expect(exportSpy).not.toHaveBeenCalled();
        expect(screen.getByText("dashboard.export.errors.crisis_required")).toBeInTheDocument();
    });

    it("rejects all-crises shapefile export date range longer than 30 days", async () => {
        useSessionSpy.mockReturnValue({
            data: {
                user: {
                    role: "ADMIN",
                },
            },
        });
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.selectOptions(screen.getByLabelText("dashboard.export.fields.format"), "shapefile");
        await user.type(screen.getByLabelText("dashboard.export.fields.date_from"), "2026-01-01T00:00");
        await user.type(screen.getByLabelText("dashboard.export.fields.date_to"), "2026-02-15T00:00");
        await user.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        expect(exportSpy).not.toHaveBeenCalled();
        expect(screen.getByText("dashboard.export.errors.all_crises_date_range_max_shapefile_30_days")).toBeInTheDocument();
    });

    it("submits all-crises csv export when date range is longer than 30 days but within 365 days", async () => {
        useSessionSpy.mockReturnValue({
            data: {
                user: {
                    role: "ADMIN",
                },
            },
        });
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.type(screen.getByLabelText("dashboard.export.fields.date_from"), "2026-01-01T00:00");
        await user.type(screen.getByLabelText("dashboard.export.fields.date_to"), "2026-02-15T00:00");
        await user.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        await waitFor(() => {
            expect(exportSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    format: "csv",
                    dateFrom: "2026-01-01T00:00",
                    dateTo: "2026-02-15T00:00",
                }),
            );
        });

        const firstCall = exportSpy.mock.calls[0][0] as Record<string, unknown>;
        expect(firstCall).not.toHaveProperty("crisisId");
    });

    it("rejects all-crises csv export date range longer than 365 days", async () => {
        useSessionSpy.mockReturnValue({
            data: {
                user: {
                    role: "ADMIN",
                },
            },
        });
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.type(screen.getByLabelText("dashboard.export.fields.date_from"), "2026-01-01T00:00");
        await user.type(screen.getByLabelText("dashboard.export.fields.date_to"), "2027-02-15T00:00");
        await user.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        expect(exportSpy).not.toHaveBeenCalled();
        expect(screen.getByText("dashboard.export.errors.all_crises_date_range_max_streaming_365_days")).toBeInTheDocument();
    });

    it("shows admin all-crises limit helper and tooltip", async () => {
        useSessionSpy.mockReturnValue({
            data: {
                user: {
                    role: "ADMIN",
                },
            },
        });
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        expect(screen.getByText("dashboard.export.all_crises_limits_hint")).toBeInTheDocument();

        await user.hover(screen.getByRole("button", { name: "dashboard.export.all_crises_limits_tooltip_label" }));

        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("dashboard.export.all_crises_limits_tooltip");
    });

    it("shows all-crises helper near crisis selector for admin users", () => {
        useSessionSpy.mockReturnValue({
            data: {
                user: {
                    role: "ADMIN",
                },
            },
        });
        render(<DashboardExportPage />);

        expect(screen.getByText("dashboard.export.all_crises_selector_hint")).toBeInTheDocument();
    });

    it("does not show admin all-crises limit helper for analyst users", () => {
        render(<DashboardExportPage />);

        expect(screen.queryByText("dashboard.export.all_crises_limits_hint")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "dashboard.export.all_crises_limits_tooltip_label" })).not.toBeInTheDocument();
        expect(screen.queryByText("dashboard.export.all_crises_selector_hint")).not.toBeInTheDocument();
    });

    it("shows bounds helper guidance and a tooltip explanation", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        expect(screen.getByText("dashboard.export.bounds_help")).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.getByRole("button", { name: "dashboard.export.bounds_tooltip_label" })).toBeInTheDocument();
        });

        await user.hover(screen.getByRole("button", { name: "dashboard.export.bounds_tooltip_label" }));

        const tooltip = await screen.findByRole("tooltip");
        expect(tooltip).toHaveTextContent("dashboard.export.bounds_tooltip");
        const tooltipContent = document.querySelector("[data-slot='tooltip-content']");
        expect(tooltipContent).not.toBeNull();
        expect(tooltipContent?.className).toContain("max-w-64");
    });

    it("blocks submit when bounds format is invalid", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.click(screen.getByRole("combobox", { name: "dashboard.map.crisis_selector_label" }));
        await user.type(screen.getByLabelText("dashboard.export.fields.bounds"), "34.7,31.5,35.9");
        await user.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        expect(exportSpy).not.toHaveBeenCalled();
        expect(screen.getByText("dashboard.export.errors.bounds_invalid")).toBeInTheDocument();
    });

    it("auto-fills bounds from map viewport without requiring button click", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.click(screen.getByRole("button", { name: "emit-viewport" }));

        expect(screen.getByLabelText("dashboard.export.fields.bounds")).toHaveValue("110,5,120,10");
    });

    it("keeps bounds synced as map moves", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.click(screen.getByRole("button", { name: "emit-viewport" }));
        expect(screen.getByLabelText("dashboard.export.fields.bounds")).toHaveValue("110,5,120,10");

        await user.click(screen.getByRole("button", { name: "emit-viewport-next" }));
        expect(screen.getByLabelText("dashboard.export.fields.bounds")).toHaveValue("111,6,121,11");
    });

    it("converts crisis extent bbox for map fit bounds when crisis is selected", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.click(screen.getByRole("combobox", { name: "dashboard.map.crisis_selector_label" }));

        await waitFor(() => {
            expect(getCrisisByIdSpy).toHaveBeenCalledWith("c1");
            expect(screen.getByTestId("fit-bounds")).toHaveTextContent("31.5,34.7,33,35.9");
        });
    });

    it("clears map fit bounds when switching to a crisis without extent", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.click(screen.getByRole("combobox", { name: "dashboard.map.crisis_selector_label" }));
        await waitFor(() => {
            expect(screen.getByTestId("fit-bounds")).toHaveTextContent("31.5,34.7,33,35.9");
        });

        await user.click(screen.getByRole("button", { name: "dashboard.map.select_crisis_c2" }));
        await waitFor(() => {
            expect(getCrisisByIdSpy).toHaveBeenCalledWith("c2");
            expect(screen.getByTestId("fit-bounds")).toHaveTextContent("none");
        });
    });

    it("stops auto-sync when user manually types bounds; button snaps back to map", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.click(screen.getByRole("button", { name: "emit-viewport" }));
        expect(screen.getByLabelText("dashboard.export.fields.bounds")).toHaveValue("110,5,120,10");

        await user.clear(screen.getByLabelText("dashboard.export.fields.bounds"));
        await user.type(screen.getByLabelText("dashboard.export.fields.bounds"), "custom");

        // map moves — should NOT override manual input
        await user.click(screen.getByRole("button", { name: "emit-viewport-next" }));
        expect(screen.getByLabelText("dashboard.export.fields.bounds")).toHaveValue("custom");

        // clicking the button snaps back to map viewport
        await user.click(screen.getByRole("button", { name: "dashboard.export.use_current_extent" }));
        expect(screen.getByLabelText("dashboard.export.fields.bounds")).toHaveValue("111,6,121,11");
    });

    it("submits successfully with map-derived bounds that include longitudes above 90", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.click(screen.getByRole("combobox", { name: "dashboard.map.crisis_selector_label" }));
        await user.click(screen.getByRole("button", { name: "emit-viewport" }));
        await user.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        await waitFor(() => {
            expect(exportSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    bounds: "110,5,120,10",
                }),
            );
        });
        expect(screen.queryByText("dashboard.export.errors.bounds_invalid")).not.toBeInTheDocument();
    });

    it("submits export job and renders download link when completed", async () => {
        exportStatusSpy.mockResolvedValueOnce({
            jobId: "job-1",
            status: "completed",
            url: "https://example.com/export.csv",
            expiresAt: "2099-01-01T00:00:00.000Z",
        });

        render(<DashboardExportPage />);

        fireEvent.click(screen.getByRole("combobox", { name: "dashboard.map.crisis_selector_label" }));
        fireEvent.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        await waitFor(() => {
            expect(exportSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    crisisId: "c1",
                    format: "csv",
                }),
            );
            expect(exportStatusSpy).toHaveBeenCalledWith("job-1");
        });

        const row = screen.getByTestId("export-job-job-1");
        const link = within(row).getByRole("link", { name: "dashboard.export.download" });
        expect(link).toHaveAttribute("href", "https://example.com/export.csv");
    });

    it("schedules polling while job is non-terminal", async () => {
        const timeoutSpy = vi.spyOn(window, "setTimeout");
        exportStatusSpy.mockResolvedValueOnce({ jobId: "job-1", status: "processing" });

        render(<DashboardExportPage />);

        fireEvent.click(screen.getByRole("combobox", { name: "dashboard.map.crisis_selector_label" }));
        fireEvent.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        await waitFor(() => {
            expect(exportStatusSpy).toHaveBeenCalledTimes(1);
            expect(timeoutSpy).toHaveBeenCalled();
        });

        const pollDelays = timeoutSpy.mock.calls.map((call) => call[1]);
        expect(pollDelays).toContain(3000);
    });

    it("does not schedule polling after terminal failed status", async () => {
        const timeoutSpy = vi.spyOn(window, "setTimeout");
        exportStatusSpy.mockResolvedValueOnce({ jobId: "job-1", status: "failed" });

        render(<DashboardExportPage />);

        fireEvent.click(screen.getByRole("combobox", { name: "dashboard.map.crisis_selector_label" }));
        fireEvent.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        await waitFor(() => {
            expect(exportStatusSpy).toHaveBeenCalledTimes(1);
        });
        expect(exportStatusSpy).toHaveBeenCalledTimes(1);
        expect(timeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 3000);
    });

    it("shows numbered map steps to guide the user", () => {
        render(<DashboardExportPage />);

        expect(screen.getByText("dashboard.export.map_step1")).toBeInTheDocument();
        // step 2 is no longer needed — bounds auto-sync, button only needed to snap back
    });

    it("shows live-sync badge on bounds label when map emits viewport", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        expect(screen.queryByText("dashboard.export.bounds_live_badge")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "emit-viewport" }));

        expect(screen.getByText("dashboard.export.bounds_live_badge")).toBeInTheDocument();
    });

    it("removes live-sync badge when user manually types in bounds", async () => {
        const user = userEvent.setup();
        render(<DashboardExportPage />);

        await user.click(screen.getByRole("button", { name: "emit-viewport" }));
        await user.click(screen.getByRole("button", { name: "dashboard.export.use_current_extent" }));
        expect(screen.getByText("dashboard.export.bounds_live_badge")).toBeInTheDocument();

        await user.clear(screen.getByLabelText("dashboard.export.fields.bounds"));
        expect(screen.queryByText("dashboard.export.bounds_live_badge")).not.toBeInTheDocument();
    });

    it("shows expired re-export action when completed URL is expired", async () => {
        exportStatusSpy.mockResolvedValueOnce({
            jobId: "job-1",
            status: "completed",
            url: "https://example.com/export.csv",
            expiresAt: "2000-01-01T00:00:00.000Z",
        });

        render(<DashboardExportPage />);

        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.map.crisis_selector_label" }));
        await userEvent.click(screen.getByRole("button", { name: "dashboard.export.submit" }));

        await waitFor(() => {
            const row = screen.getByTestId("export-job-job-1");
            expect(within(row).queryByRole("link", { name: "dashboard.export.download" })).not.toBeInTheDocument();
            expect(within(row).getByRole("button", { name: "dashboard.export.reexport" })).toBeInTheDocument();
            expect(within(row).getByText("dashboard.export.status.expired")).toBeInTheDocument();
        });
    });
});
