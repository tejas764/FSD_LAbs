import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe, toHaveNoViolations } from "jest-axe";

const mocks = vi.hoisted(() => ({
  translate: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  connection: { isOnline: false, mode: "offline", preference: "offline", ready: true, syncing: false, pendingCount: 0, failedCount: 0, lastSync: null, error: null, syncNow: async () => {} },
}));
vi.mock("@/lib/offline/connectivity", () => ({ useConnectivity: () => mocks.connection }));
vi.mock("@/lib/offline/field-store", () => ({
  FIELD_DATA_EVENT: "crisismap:field-data", listFieldMessages: async () => [], queueFieldMessage: vi.fn(), exportFieldPacket: vi.fn(), importFieldPacket: vi.fn(),
}));
vi.mock("@/lib/offline/queue", () => ({ listAll: async () => [] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.translate, i18n: { language: "en" } }) }));

import { OfflineWorkspace } from "./offline-workspace";

expect.extend(toHaveNoViolations);

describe("OfflineWorkspace a11y", () => {
  it.each(["Messages & SOS", "Mesh demonstration", "Local data & recovery"])("has no axe violations in %s view", async (view) => {
    const { container } = render(<main><h1>Field operations</h1><OfflineWorkspace /></main>);
    await screen.findByText("No field messages saved yet. Your first message will appear here.");
    if (view !== "Messages & SOS") await userEvent.click(screen.getByRole("button", { name: view }));
    expect(await axe(container)).toHaveNoViolations();
  });
});
