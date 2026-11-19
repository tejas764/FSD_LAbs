// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { createContext, useContext, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { LanguageSwitcher } from "./language-switcher";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const dictionary: Record<string, string> = {
        language_label: "language_label",
        "language_native.ar": "العربية",
        "language_native.zh": "中文",
        "language_native.en": "English",
        "language_native.fr": "Français",
        "language_native.es": "Español",
        "language_native.ru": "Русский",
      };

      return dictionary[key] ?? key;
    },
  }),
}));

vi.mock("@/components/ui/select", () => {
  type SelectCtx = { value: string; onValueChange?: (v: string) => void };
  const Ctx = createContext<SelectCtx>({ value: "" });

  const Select = ({ value, onValueChange, children }: {
    value: string;
    onValueChange?: (value: string) => void;
    children: ReactNode;
  }) => (
    <Ctx.Provider value={{ value, onValueChange }}>
      {children}
    </Ctx.Provider>
  );

  const SelectTrigger = ({ children }: { children: ReactNode }) => (
    <button type="button" aria-label="language_label">
      {children}
    </button>
  );
  const SelectValue = () => null;
  const SelectContent = ({ children, showArrow, arrowClassName }: { children: ReactNode; showArrow?: boolean; arrowClassName?: string }) => {
    const ctx = useContext(Ctx);
    return (
      <>
        <select
          aria-label="language_label"
          value={ctx.value}
          onChange={(event) => ctx.onValueChange?.(event.target.value)}
        >
          {children}
        </select>
        {showArrow ? <span data-slot="select-arrow" className={arrowClassName} /> : null}
      </>
    );
  };
  const SelectItem = ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  );

  return {
    Select,
    SelectTrigger,
    SelectValue,
    SelectContent,
    SelectItem,
  };
});

vi.mock("lucide-react", () => ({
  Languages: (props: React.SVGProps<SVGSVGElement> & { "data-testid"?: string }) => (
    <svg data-testid="languages-icon" {...props} />
  ),
}));

describe("LanguageSwitcher", () => {
  it("renders six language options in native scripts", () => {
    render(<LanguageSwitcher currentLanguage="en" onLanguageChange={() => { }} />);

    expect(screen.getByRole("option", { name: /العربية/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /中文/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /English/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Français/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Español/ })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Русский/ })).toBeInTheDocument();
  });

  it("calls onLanguageChange when selection changes", () => {
    const onLanguageChange = vi.fn();

    render(
      <LanguageSwitcher
        currentLanguage="en"
        onLanguageChange={onLanguageChange}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: "language_label" }), {
      target: { value: "ar" },
    });

    expect(onLanguageChange).toHaveBeenCalledWith("ar");
  });

  it("shows the current language as an uppercase 2-char code in the trigger", () => {
    render(<LanguageSwitcher currentLanguage="fr" onLanguageChange={() => { }} />);
    expect(screen.getByText("FR")).toBeInTheDocument();
  });

  it("shows a Languages icon in the trigger", () => {
    render(<LanguageSwitcher currentLanguage="en" onLanguageChange={() => { }} />);
    expect(screen.getByTestId("languages-icon")).toBeInTheDocument();
  });

  it("does not render a visible label element", () => {
    render(<LanguageSwitcher currentLanguage="en" onLanguageChange={() => { }} />);
    expect(screen.queryByText("language_label")).not.toBeInTheDocument();
  });

  it("configures the dropdown with an arrow using a 1px top offset", () => {
    render(<LanguageSwitcher currentLanguage="en" onLanguageChange={() => { }} />);
    expect(document.querySelector('[data-slot="select-arrow"]')).toHaveClass("top-px");
  });
});