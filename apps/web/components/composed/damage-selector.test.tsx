// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DamageSelector } from "./damage-selector";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("DamageSelector", () => {
  it("renders all damage options", () => {
    render(<DamageSelector value={null} onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: /damage_minimal/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /damage_partial/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /damage_complete/i })).toBeInTheDocument();
  });

  it("calls onChange when selecting an option", () => {
    const onChange = vi.fn();
    render(<DamageSelector value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /damage_partial/i }));
    expect(onChange).toHaveBeenCalledWith("PARTIAL");
  });
});
