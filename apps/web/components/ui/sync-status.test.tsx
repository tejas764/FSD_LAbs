// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { SyncStatus } from "./sync-status";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("SyncStatus", () => {
  it("announces local and synced status politely", () => {
    const { rerender } = render(<SyncStatus status="local" />);
    expect(screen.getByText("sync.saved_locally").parentElement).toHaveAttribute(
      "aria-live",
      "polite",
    );

    rerender(<SyncStatus status="synced" />);
    expect(screen.getByText("sync.synced").parentElement).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("marks failed status as alert", () => {
    render(<SyncStatus status="failed" />);
    expect(screen.getByText("sync.failed").parentElement).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("marks syncing status as busy", () => {
    render(<SyncStatus status="syncing" />);
    expect(screen.getByText("sync.syncing").parentElement).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("uses static CloudUpload icon when reduced motion is enabled", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<SyncStatus status="syncing" />);
    expect(screen.getByTestId("sync-status-icon-cloud-upload")).toBeInTheDocument();
  });
});
