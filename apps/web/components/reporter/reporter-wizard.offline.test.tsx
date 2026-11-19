// @vitest-environment jsdom
import "@testing-library/jest-dom";
import "fake-indexeddb/auto";
import { Blob as NativeBlob, File as NativeFile } from "node:buffer";
import { FormData as NativeFormData } from "next/dist/compiled/@edge-runtime/primitives/fetch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { getById, listAll, listPending, __resetDb } from "@/lib/offline/queue";
import { ConnectivityProvider } from "@/lib/offline/connectivity";
import { setApiReachable, setModePreference } from "@/lib/offline/mode";
import { ApiError } from "@/lib/api/client";

const pushMock = vi.fn();
const submitMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => pushMock(...args),
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/components/composed/photo-upload", () => ({
  PhotoUpload: ({ onChange }: { onChange: (file: File) => void }) => (
    <button
      type="button"
      onClick={() => onChange(new File(["photo"], "photo.webp", { type: "image/webp" }))}
    >
      set-photo
    </button>
  ),
}));

vi.mock("@/components/composed/damage-selector", () => ({
  DamageSelector: ({ onChange }: { onChange: (value: "MINIMAL") => void }) => (
    <button type="button" onClick={() => onChange("MINIMAL")}>
      set-damage
    </button>
  ),
}));

vi.mock("./map-picker", () => ({
  MapPicker: ({ onSelect }: { onSelect: (value: { lat: number; lon: number }) => void }) => (
    <button type="button" onClick={() => onSelect({ lat: 1, lon: 2 })}>
      set-coords
    </button>
  ),
}));

vi.mock("@/lib/api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;

    constructor(status: number, code?: string) {
      super(code);
      this.status = status;
      this.code = code;
    }
  },
  apiClient: {
    crises: {
      list: vi.fn().mockResolvedValue([{ id: "crisis-1", name: "Crisis 1" }]),
      modularSchema: vi.fn().mockResolvedValue({ dynamicFields: {} }),
    },
    reports: {
      submit: (...args: unknown[]) => submitMock(...args),
    },
  },
}));

import { ReporterWizard } from "./reporter-wizard";

async function fillAndSubmitReport() {
  fireEvent.click(screen.getByRole("button", { name: "set-photo" }));
  fireEvent.click(screen.getByRole("button", { name: "set-coords" }));
  fireEvent.click(screen.getByRole("button", { name: "button.next" }));
  fireEvent.click(screen.getByRole("button", { name: "set-damage" }));
  const combobox = await waitFor(() => screen.getByRole("combobox", { name: "reporter.wizard.fields.crisis" }));
  fireEvent.click(combobox);
  await waitFor(() => expect(screen.getByRole("option", { name: "Crisis 1" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("option", { name: "Crisis 1" }));
  fireEvent.click(screen.getByRole("button", { name: "button.next" }));
  fireEvent.change(screen.getByPlaceholderText("step.details.infra_name_placeholder"), { target: { value: "Bridge A" } });
  fireEvent.change(screen.getByPlaceholderText("step.confirm.description_placeholder"), { target: { value: "Bridge damaged" } });
  fireEvent.click(screen.getByRole("button", { name: "button.next" }));
  fireEvent.click(screen.getByRole("button", { name: "button.submit" }));
}

describe("ReporterWizard offline queue + reconnect sync", () => {
  beforeEach(() => {
    __resetDb();
    pushMock.mockReset();
    submitMock.mockReset();
    submitMock.mockResolvedValue({ id: "remote-1" });
    // Prevent draft step from leaking between tests (sessionStorage persists across renders)
    sessionStorage.removeItem("crisismap_reporter_wizard_v2");
    localStorage.clear();
    setModePreference("online");
    setApiReachable(true);
    // fake-indexeddb uses Node's structuredClone, so keep cloned blobs and
    // multipart bodies in the same realm rather than mixing jsdom wrappers.
    vi.stubGlobal("Blob", NativeBlob);
    vi.stubGlobal("File", NativeFile);
    vi.stubGlobal("FormData", NativeFormData);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/health")) return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
      if (String(url).includes("/field-messages")) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
      throw new Error(`Unexpected request: ${url}`);
    }));

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("queues report offline then syncs on reconnect", async () => {
    render(<ConnectivityProvider><ReporterWizard /></ConnectivityProvider>);
    await fillAndSubmitReport();

    await waitFor(async () => {
      const pending = await listPending();
      expect(pending).toHaveLength(1);
    });

    const pending = await listPending();
    const queuedId = pending[0].id;
    const idempotencyKey = pending[0].idempotencyKey;
    expect(submitMock).not.toHaveBeenCalled();

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });

    await act(async () => { window.dispatchEvent(new Event("online")); });

    await waitFor(async () => {
      const synced = await getById(queuedId);
      expect(synced?.status).toBe("synced");
    });

    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith(expect.any(FormData), idempotencyKey);
  }, 20_000);

  it("reuses the original submission key after a lost online acknowledgment", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    submitMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue({ id: "remote-after-loss" });
    render(<ConnectivityProvider><ReporterWizard /></ConnectivityProvider>);
    await fillAndSubmitReport();
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(2));
    const firstKey = submitMock.mock.calls[0][1];
    expect(submitMock.mock.calls[1][1]).toBe(firstKey);
    await waitFor(async () => {
      const report = (await listAll()).find((item) => item.idempotencyKey === firstKey);
      expect(report?.status).toBe("synced");
      expect(report?.serverId).toBe("remote-after-loss");
    });
  }, 20_000);

  it("retains a rate-limited submission as queued with backoff instead of immediately retrying", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    submitMock.mockRejectedValueOnce(new ApiError(429, "rate_limited"));
    render(<ConnectivityProvider><ReporterWizard /></ConnectivityProvider>);
    await fillAndSubmitReport();
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
    const originalKey = submitMock.mock.calls[0][1];
    const report = (await listAll()).find((item) => item.idempotencyKey === originalKey);
    expect(report?.status).toBe("queued");
    expect(report?.retryCount).toBe(1);
    expect(report?.nextRetryAt).toBeGreaterThan(Date.now() + 50_000);
    expect(pushMock).toHaveBeenLastCalledWith(expect.stringContaining("status=queued"));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await new Promise((resolve) => setTimeout(resolve, 150));
    });
    expect(submitMock).toHaveBeenCalledTimes(1);
  }, 20_000);

  it("renders icon-enhanced Back and Next buttons", async () => {
    render(<ReporterWizard />);

    // Back button is hidden on step 0; advance to step 1 first
    fireEvent.click(screen.getByRole("button", { name: "set-photo" }));
    fireEvent.click(screen.getByRole("button", { name: "set-coords" }));
    fireEvent.click(screen.getByRole("button", { name: "button.next" }));

    const backButton = screen.getByRole("button", { name: "button.back" });
    const nextButton = screen.getByRole("button", { name: "button.next" });

    expect(backButton.querySelector("svg")).toBeInTheDocument();
    expect(nextButton.querySelector("svg")).toBeInTheDocument();
  });
});
