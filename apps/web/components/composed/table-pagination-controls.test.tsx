// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import { TablePaginationControls } from "./table-pagination-controls";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === "dashboard.overview.table_page_of") {
        return `Page ${String(opts?.page)} of ${String(opts?.total)}`;
      }
      return key;
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectTrigger: ({ children, ...props }: React.HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe("TablePaginationControls", () => {
  it("formats page and total values with grouping separators", () => {
    render(
      <TablePaginationControls
        page={1234}
        total={4911012}
        canGoPrev
        canGoNext
        onPrev={() => {}}
        onNext={() => {}}
        pageSize={20}
        onPageSizeChange={() => {}}
      />,
    );

    expect(screen.getByText("Page 1,234 of 4,911,012")).toBeInTheDocument();
  });
});
