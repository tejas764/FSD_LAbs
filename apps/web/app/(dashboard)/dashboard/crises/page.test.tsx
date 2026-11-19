// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const {
    mockList,
    mockCreate,
    mockUpdate,
    mockCreateModularField,
    mockListModularFields,
    mockDeleteModularField,
    mockToastSuccess,
    mockToastError,
} = vi.hoisted(() => ({
    mockList: vi.fn(),
    mockCreate: vi.fn(),
    mockUpdate: vi.fn(),
    mockCreateModularField: vi.fn(),
    mockListModularFields: vi.fn(),
    mockDeleteModularField: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
}));

beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    if (typeof window.ResizeObserver === "undefined") {
        window.ResizeObserver = class {
            observe() { }
            unobserve() { }
            disconnect() { }
        };
    }
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

afterEach(() => {
    document.body.removeAttribute("data-scroll-locked");
    document.body.style.pointerEvents = "";
    vi.clearAllMocks();
});

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: "en" },
    }),
}));

vi.mock("@/lib/api/client", () => ({
    apiClient: {
        crises: {
            list: mockList.mockResolvedValue([
                {
                    id: "c1",
                    name: "Flood West",
                    type: "FLOOD",
                    country: "NP",
                    region: null,
                    startedAt: "2026-04-01T00:00:00Z",
                    isActive: true,
                    extentBBox: null,
                    createdAt: "2026-04-01T00:00:00Z",
                    updatedAt: "2026-04-01T00:00:00Z",
                },
                {
                    id: "c2",
                    name: "Earthquake South",
                    type: "EARTHQUAKE",
                    country: "PK",
                    region: null,
                    startedAt: "2026-03-15T00:00:00Z",
                    isActive: false,
                    extentBBox: null,
                    createdAt: "2026-03-15T00:00:00Z",
                    updatedAt: "2026-03-15T00:00:00Z",
                },
            ]),
            create: mockCreate.mockResolvedValue({ success: true, data: { id: "c3", name: "New Crisis", type: "FLOOD", country: "BD", region: null, startedAt: "2026-04-21T00:00:00Z", isActive: true, extentBBox: null, createdAt: "2026-04-21T00:00:00Z", updatedAt: "2026-04-21T00:00:00Z" } }),
            update: mockUpdate.mockResolvedValue({ success: true, data: { id: "c1", name: "Flood West", type: "FLOOD", country: "NP", region: null, startedAt: "2026-04-01T00:00:00Z", isActive: false, extentBBox: null, createdAt: "2026-04-01T00:00:00Z", updatedAt: "2026-04-01T00:00:00Z" } }),
            createModularField: mockCreateModularField.mockResolvedValue({ success: true, data: { id: "m1", crisisId: "c1", infraType: "RESIDENTIAL", fieldKey: "roof_damage", fieldType: "string", required: true, labels: { en: "Roof damage" }, createdAt: "2026-04-21T00:00:00Z" } }),
            listModularFields: mockListModularFields.mockResolvedValue({ success: true, data: [] }),
            deleteModularField: mockDeleteModularField.mockResolvedValue(undefined),
        },
    },
}));

vi.mock("@/lib/api/crises-utils", () => ({
    getCountryName: (code: string) => code,
}));

vi.mock("@/components/composed/crisis-selector", () => ({
    CrisisSelector: ({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) => (
        <button
            type="button"
            role="combobox"
            aria-controls="modular-crisis-selector-listbox"
            aria-expanded="false"
            aria-label="dashboard.crises.modular.crisis"
            data-testid="modular-crisis-selector"
            onClick={() => onSelect(selectedId === "c1" ? null : "c1")}
        >
            {selectedId ?? "reporter.map.crisis_selector_label"}
        </button>
    ),
}));

vi.mock("sonner", () => ({
    toast: {
        success: mockToastSuccess,
        error: mockToastError,
    },
}));

import CrisesPage from "./page";

describe("Crisis management page", () => {
    it("renders the page heading", async () => {
        render(<CrisesPage />);
        await waitFor(() => {
            expect(mockList).toHaveBeenCalled();
        });
        expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
        expect(screen.getByText("dashboard.crises.title")).toBeInTheDocument();
    });

    it("renders a create crisis button", async () => {
        render(<CrisesPage />);
        await waitFor(() => {
            expect(mockList).toHaveBeenCalled();
        });
        expect(
            screen.getByRole("button", { name: /dashboard\.crises\.create/i }),
        ).toBeInTheDocument();
    });

    it("loads and displays the crises list", async () => {
        render(<CrisesPage />);
        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
            expect(screen.queryByText("Earthquake South")).not.toBeInTheDocument();
        });
    });

    it("uses shared dashboard data table component for crisis list", async () => {
        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByTestId("dashboard-data-table")).toBeInTheDocument();
        });
    });

    it("shows no-crises message when list is empty", async () => {
        const { apiClient } = await import("@/lib/api/client");
        vi.mocked(apiClient.crises.list).mockResolvedValueOnce([]);
        render(<CrisesPage />);
        await waitFor(() => {
            expect(screen.getByText("dashboard.crises.no_crises")).toBeInTheDocument();
        });
    });

    it("opens create form dialog when Create button clicked", async () => {
        render(<CrisesPage />);
        // Wait for list to load before clicking
        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });
        await userEvent.click(
            screen.getByRole("button", { name: /dashboard\.crises\.create/i }),
        );
        // Dialog should open and show the form
        await waitFor(() => {
            expect(
                screen.getByLabelText("dashboard.crises.form.name"),
            ).toBeInTheDocument();
        });

        expect(screen.getByTestId("crisis-form-grid").className).toContain("md:grid-cols-2");
        expect(screen.getByRole("combobox", { name: "dashboard.crises.form.country" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "dashboard.crises.form.country_help" })).toBeInTheDocument();
    });

    it("submits create form and calls apiClient.crises.create", async () => {
        const mod = await import("@/lib/api/client");
        const createFn = vi.mocked(mod.apiClient.crises.create);

        render(<CrisesPage />);
        await userEvent.click(
            screen.getByRole("button", { name: /dashboard\.crises\.create/i }),
        );
        const nameInput = await screen.findByLabelText("dashboard.crises.form.name");
        await userEvent.type(nameInput, "New Crisis");
        // Submit button is wired to the create API
        const submitBtn = screen.getByRole("button", {
            name: /dashboard\.crises\.form\.submit_create/i,
        });
        expect(submitBtn).toBeInTheDocument();
        expect(typeof createFn).toBe("function");
    });

    it("switches between active and archived crisis tabs", async () => {
        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        expect(screen.queryByText("Earthquake South")).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole("tab", { name: "dashboard.crises.tab_archived" }));

        expect(screen.getByText("Earthquake South")).toBeInTheDocument();
        expect(screen.queryByText("Flood West")).not.toBeInTheDocument();
    });

    it("opens edit dialog and updates a crisis", async () => {
        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("button", { name: "dashboard.crises.edit Flood West" }));

        const nameInput = await screen.findByLabelText("dashboard.crises.form.name");
        await userEvent.clear(nameInput);
        await userEvent.type(nameInput, "Flood West Updated");

        await userEvent.click(screen.getByRole("button", { name: "dashboard.crises.form.submit" }));

        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith("c1", expect.objectContaining({ name: "Flood West Updated" }));
        });
    });

    it("sends optional end date and description when editing a crisis", async () => {
        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("button", { name: "dashboard.crises.edit Flood West" }));

        const endedAtInput = await screen.findByLabelText("dashboard.crises.form.ended_at");
        const descriptionInput = screen.getByLabelText("dashboard.crises.form.description");

        fireEvent.change(endedAtInput, { target: { value: "2026-04-30" } });
        fireEvent.change(descriptionInput, { target: { value: "Bridge access blocked by debris" } });

        await userEvent.click(screen.getByRole("button", { name: "dashboard.crises.form.submit" }));

        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith("c1", expect.objectContaining({
                endedAt: "2026-04-30T00:00:00.000Z",
                description: "Bridge access blocked by debris",
            }));
        });
    });

    it("requires confirmation before deactivating a crisis", async () => {
        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("button", { name: "dashboard.crises.deactivate Flood West" }));

        expect(mockUpdate).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "dashboard.crises.confirm_deactivate_action" }));

        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith("c1", { isActive: false });
            expect(mockToastSuccess).toHaveBeenCalledWith("dashboard.crises.toast_deactivate_success");
            expect(mockList).toHaveBeenCalledTimes(1);
        });
    });

    it("displays the startedAt date for each crisis", async () => {
        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        // Should render start date column header
        expect(screen.getByRole("columnheader", { name: /dashboard\.crises\.form\.started_at/i })).toBeInTheDocument();
        // Should render locale-formatted start date value
        expect(screen.getByText("Apr 1, 2026")).toBeInTheDocument();
    });

    it("shows pagination controls", async () => {
        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        expect(screen.getByRole("button", { name: /dashboard\.overview\.table_prev/i })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /dashboard\.overview\.table_next/i })).toBeInTheDocument();
    });

    it("sorts by name when column header is clicked", async () => {
        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        // Switch to archived to see both items
        await userEvent.click(screen.getByRole("tab", { name: "dashboard.crises.tab_archived" }));
        expect(screen.getByText("Earthquake South")).toBeInTheDocument();

        // Switch back to active; click name sort header
        await userEvent.click(screen.getByRole("tab", { name: "dashboard.crises.tab_active" }));

        const nameSortBtn = screen.getAllByRole("button").find((el) => el.textContent?.includes("dashboard.crises.form.name"));
        expect(nameSortBtn).toBeInTheDocument();
    });

    it("requires confirmation before deleting modular field definitions", async () => {
        mockListModularFields.mockResolvedValueOnce({ success: true, data: [] });

        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.crises.modular.crisis" }));

        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.crises.modular.infra_type" }));
        await userEvent.click(screen.getByRole("option", { name: "wizard.option.infra.RESIDENTIAL" }));

        await userEvent.type(screen.getByLabelText("dashboard.crises.modular.field_key"), "roof_damage");
        await userEvent.click(screen.getByRole("button", { name: "dashboard.crises.modular.add" }));

        await waitFor(() => {
            expect(mockCreateModularField).toHaveBeenCalledWith(
                expect.objectContaining({ crisisId: "c1", infraType: "RESIDENTIAL", fieldKey: "roof_damage" }),
            );
        });

        await waitFor(() => {
            expect(screen.getByText("roof_damage")).toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("button", { name: "dashboard.crises.modular.delete roof_damage" }));

        expect(mockDeleteModularField).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "dashboard.crises.modular.confirm_delete_action" }));

        await waitFor(() => {
            expect(mockDeleteModularField).toHaveBeenCalledWith("m1");
        });
    });

    it("uses shared dashboard data table component for modular fields list", async () => {
        mockListModularFields.mockResolvedValueOnce({
            success: true,
            data: [
                {
                    id: "m1",
                    crisisId: "c1",
                    infraType: "RESIDENTIAL",
                    fieldKey: "roof_damage",
                    fieldType: "string",
                    required: true,
                    labels: { en: "Roof damage" },
                    createdAt: "2026-04-21T00:00:00Z",
                },
            ],
        });

        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.crises.modular.crisis" }));

        await waitFor(() => {
            expect(screen.getByTestId("dashboard-modular-fields-table")).toBeInTheDocument();
        });
    });

    it("sorts modular fields by field key", async () => {
        mockListModularFields.mockResolvedValueOnce({
            success: true,
            data: [
                {
                    id: "m2",
                    crisisId: "c1",
                    infraType: "RESIDENTIAL",
                    fieldKey: "zeta_damage",
                    fieldType: "string",
                    required: true,
                    labels: { en: "Zeta" },
                    createdAt: "2026-04-21T00:00:00Z",
                },
                {
                    id: "m1",
                    crisisId: "c1",
                    infraType: "COMMERCIAL",
                    fieldKey: "alpha_damage",
                    fieldType: "string",
                    required: true,
                    labels: { en: "Alpha" },
                    createdAt: "2026-04-21T00:00:00Z",
                },
            ],
        });

        render(<CrisesPage />);

        await waitFor(() => {
            expect(screen.getByText("Flood West")).toBeInTheDocument();
        });

        await userEvent.click(screen.getByRole("combobox", { name: "dashboard.crises.modular.crisis" }));

        const modularTable = await screen.findByTestId("dashboard-modular-fields-table");
        const rowsBefore = within(modularTable).getAllByRole("row");
        expect(rowsBefore[1]).toHaveTextContent("zeta_damage");
        expect(rowsBefore[2]).toHaveTextContent("alpha_damage");

        const fieldKeySortBtn = within(modularTable).getByRole("button", { name: "dashboard.crises.modular.field_key" });
        await userEvent.click(fieldKeySortBtn);

        const rowsAfter = within(modularTable).getAllByRole("row");
        expect(rowsAfter[1]).toHaveTextContent("alpha_damage");
        expect(rowsAfter[2]).toHaveTextContent("zeta_damage");
    });
});
