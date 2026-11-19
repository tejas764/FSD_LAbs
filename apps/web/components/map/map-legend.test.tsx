// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

import { MapLegend } from "./map-legend";

describe("MapLegend", () => {
    it("renders a landmark with accessible label", () => {
        render(<MapLegend />);
        expect(
            screen.getByRole("region", { name: "reporter.map.legend_label" }),
        ).toBeInTheDocument();
    });

    it("shows all three damage levels", () => {
        render(<MapLegend />);
        expect(screen.getByText("damage_minimal")).toBeInTheDocument();
        expect(screen.getByText("damage_partial")).toBeInTheDocument();
        expect(screen.getByText("damage_complete")).toBeInTheDocument();
    });

    it("renders three colour swatches", () => {
        render(<MapLegend />);
        const swatches = screen.getAllByRole("img", { hidden: true });
        // Each swatch is an aria-hidden SVG/div acting as visual indicator
        expect(swatches.length).toBeGreaterThanOrEqual(3);
    });
});
