// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMessage } from "@/lib/offline/field-store";
import type { QueuedReport } from "@/lib/offline/queue";

const mocks = vi.hoisted(() => ({
  translate: (key: string, options?: { defaultValue?: string; count?: number }) => (options?.defaultValue ?? key).replace("{{count}}", String(options?.count ?? "")),
  connection: { isOnline: false, mode: "offline", preference: "offline", ready: true, syncing: false, pendingCount: 0, failedCount: 0, lastSync: null, error: null, syncNow: vi.fn(async () => {}) },
  messages: [] as FieldMessage[], reports: [] as QueuedReport[],
  queue: vi.fn(), list: vi.fn(), exportPacket: vi.fn(), importPacket: vi.fn(),
}));
vi.mock("@/lib/offline/connectivity", () => ({ useConnectivity: () => mocks.connection }));
vi.mock("@/lib/offline/field-store", () => ({
  FIELD_DATA_EVENT: "crisismap:field-data", listFieldMessages: mocks.list,
  queueFieldMessage: mocks.queue, exportFieldPacket: mocks.exportPacket, importFieldPacket: mocks.importPacket,
}));
vi.mock("@/lib/offline/queue", () => ({ listAll: async () => [...mocks.reports] }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: mocks.translate,
  i18n: { language: "en" },
}) }));

import { OfflineWorkspace } from "./offline-workspace";

describe("OfflineWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.messages = [];
    mocks.reports = [];
    Object.assign(mocks.connection, { isOnline: false, mode: "offline", preference: "offline", syncing: false, pendingCount: 0 });
    mocks.list.mockImplementation(async () => [...mocks.messages]);
    mocks.queue.mockImplementation(async (content: string, type: "TEXT" | "SOS", location?: { latitude: number; longitude: number }) => {
      const id = `message-${mocks.messages.length}`;
      mocks.messages.unshift({ id, deviceId: "device-one", content, type, status: "queued", createdAt: "2026-11-18T06:00:00.000Z", ...location });
      return id;
    });
  });

  it("saves offline messages and displays them again after remount without claiming delivery", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<OfflineWorkspace />);
    await screen.findByText("No field messages saved yet. Your first message will appear here.");
    await user.type(screen.getByRole("textbox", { name: "Message" }), "Need water at the school");
    await user.click(screen.getByRole("button", { name: "Save message" }));
    expect(mocks.queue).toHaveBeenCalledWith("Need water at the school", "TEXT", undefined);
    expect(await screen.findByText("Need water at the school")).toBeInTheDocument();
    expect(screen.getByText("Saved locally · awaiting upload")).toBeInTheDocument();
    expect(mocks.connection.syncNow).not.toHaveBeenCalled();
    unmount();
    render(<OfflineWorkspace />);
    expect(await screen.findByText("Need water at the school")).toBeInTheDocument();
    expect(screen.queryByText("Stored on server")).not.toBeInTheDocument();
    expect(screen.getByText(/An SOS record does not contact emergency services/)).toBeInTheDocument();
  });

  it("saves a default SOS record without requiring message text", async () => {
    render(<OfflineWorkspace />);
    await userEvent.click(screen.getByRole("button", { name: "Save SOS" }));
    await waitFor(() => expect(mocks.queue).toHaveBeenCalledWith("SOS: assistance requested. Please review my location if attached.", "SOS", undefined));
    expect(await screen.findByText("SOS")).toBeInTheDocument();
    expect(mocks.connection.syncNow).not.toHaveBeenCalled();
  });

  it("requests GPS only on explicit attachment and includes coordinates in the queued record", async () => {
    const getCurrentPosition = vi.fn((callback: PositionCallback) => callback({ coords: { latitude: 12.9716, longitude: 77.5946 } } as GeolocationPosition));
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
    render(<OfflineWorkspace />);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Attach current location" }));
    expect(screen.getByText("12.97160, 77.59460")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save SOS" }));
    await waitFor(() => expect(mocks.queue).toHaveBeenCalledWith(expect.any(String), "SOS", { latitude: 12.9716, longitude: 77.5946 }));
  });

  it("clearly identifies the mesh as a demonstration and never sends a message from its controls", async () => {
    render(<OfflineWorkspace />);
    await userEvent.click(screen.getByRole("button", { name: "Mesh demonstration" }));
    expect(screen.getByText("Simulation only")).toBeInTheDocument();
    expect(screen.getByText(/no active Bluetooth, Wi-Fi Direct, or LoRa transport/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show example relay paths" }));
    expect(screen.getByRole("button", { name: "Reset demonstration" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("No message is transmitted by this demonstration.")).toBeInTheDocument();
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it("keeps failed local writes visible without reporting success", async () => {
    mocks.queue.mockRejectedValueOnce(new DOMException("Quota exceeded", "QuotaExceededError"));
    render(<OfflineWorkspace />);
    await userEvent.click(screen.getByRole("button", { name: "Save SOS" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The message could not be saved");
    expect(screen.queryByText(/Saved on this device/)).not.toBeInTheDocument();
  });

  it("shows local coordinates and queued report status without fetching an online map", async () => {
    mocks.reports = [{ id: "report-one", idempotencyKey: "key", photoBlobKey: "photo", status: "queued", createdAt: "2026-11-18T06:00:00.000Z", retryCount: 0, lastError: null, formDataSerialized: { infraName: "Central school", latitude: "12.9716", longitude: "77.5946" } }];
    render(<OfflineWorkspace />);
    await userEvent.click(screen.getByRole("button", { name: "Local data & recovery" }));
    expect(await screen.findByText("Central school")).toBeInTheDocument();
    expect(screen.getByText("12.97160, 77.59460")).toBeInTheDocument();
    expect(screen.getByText("sync.queued")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all my reports" })).toHaveAttribute("href", "/my-reports");
  });

  it("refreshes the inbox when another part of the app saves field data", async () => {
    render(<OfflineWorkspace />);
    await screen.findByText("No field messages saved yet. Your first message will appear here.");
    mocks.messages = [{ id: "new-message", deviceId: "device-one", content: "Water available at shelter", type: "TEXT", status: "synced", createdAt: "2026-11-18T06:00:00.000Z" }];
    act(() => window.dispatchEvent(new Event("crisismap:field-data")));
    expect(await screen.findByText("Water available at shelter")).toBeInTheDocument();
    expect(screen.getByText("Stored on server")).toBeInTheDocument();
  });

  it("rejects oversized recovery files before reading or importing them", async () => {
    const { container } = render(<OfflineWorkspace />);
    await userEvent.click(screen.getByRole("button", { name: "Local data & recovery" }));
    const file = new File(["{}"], "backup.json", { type: "application/json" });
    Object.defineProperty(file, "size", { value: 26 * 1024 * 1024 });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("under 25 MB");
    expect(mocks.importPacket).not.toHaveBeenCalled();
  });
});
