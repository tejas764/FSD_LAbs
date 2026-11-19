// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  connection: {
    isOnline: true, mode: "online", preference: "online", ready: true,
    syncing: false, pendingCount: 0, failedCount: 0, lastSync: null, error: null,
    setPreference: vi.fn(), syncNow: vi.fn(async () => {}),
  },
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
}));
vi.mock("@/lib/offline/connectivity", () => ({ useConnectivity: () => mocks.connection }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => mocks.router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: { defaultValue?: string; count?: number }) => (options?.defaultValue ?? key).replace("{{count}}", String(options?.count ?? "")),
}) }));

import { ConnectivityControls } from "./connectivity-controls";

describe("ConnectivityControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/";
    Object.assign(mocks.connection, { isOnline: true, mode: "online", preference: "online", ready: true, syncing: false, pendingCount: 0, failedCount: 0 });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it.each(["{Enter}", " "])("allows keyboard toggling with %s and opens the offline workspace", async (key) => {
    const user = userEvent.setup();
    render(<ConnectivityControls />);
    const control = screen.getByRole("switch", { name: "Online mode" });
    expect(control).toHaveAttribute("aria-checked", "true");
    await user.tab();
    expect(control).toHaveFocus();
    await user.keyboard(key);
    expect(mocks.connection.setPreference).toHaveBeenCalledWith("offline");
    expect(mocks.router.push).toHaveBeenCalledWith("/offline");
  });

  it("returns to the map when online mode is selected from the offline workspace", async () => {
    mocks.pathname = "/offline";
    Object.assign(mocks.connection, { isOnline: false, mode: "offline", preference: "offline" });
    render(<ConnectivityControls />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    await userEvent.click(screen.getByRole("switch"));
    expect(mocks.connection.setPreference).toHaveBeenCalledWith("online");
    expect(mocks.router.push).toHaveBeenCalledWith("/");
  });

  it("keeps the offline workspace open when internet is unavailable", async () => {
    mocks.pathname = "/offline";
    Object.assign(mocks.connection, { isOnline: false, mode: "offline", preference: "offline" });
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    render(<ConnectivityControls />);
    await userEvent.click(screen.getByRole("switch"));
    expect(mocks.connection.setPreference).toHaveBeenCalledWith("online");
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it("waits for restored preferences before navigation or offline route prefetching", () => {
    mocks.connection.ready = false;
    const { rerender } = render(<ConnectivityControls />);
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(mocks.router.prefetch).not.toHaveBeenCalled();
    Object.assign(mocks.connection, { ready: true, isOnline: false });
    rerender(<ConnectivityControls />);
    expect(mocks.router.replace).toHaveBeenCalledWith("/offline");
  });

  it.each(["/report", "/report/success", "/my-reports", "/preparedness", "/resources", "/volunteer", "/volunteer/profile", "/ai-logs", "/dashboard/volunteers"])("preserves %s when connectivity drops", (pathname) => {
    mocks.pathname = pathname;
    mocks.connection.isOnline = false;
    render(<ConnectivityControls />);
    expect(mocks.router.replace).not.toHaveBeenCalled();
  });

  it("shows actual offline connectivity despite an online preference and disables sync", () => {
    Object.assign(mocks.connection, { isOnline: false, pendingCount: 2, failedCount: 1 });
    render(<ConnectivityControls />);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Offline")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync saved data" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sync saved data" })).toHaveAttribute("title", "3 records waiting");
    expect(mocks.connection.syncNow).not.toHaveBeenCalled();
  });

  it("opens the offline workspace from a dashboard that requires the server", () => {
    mocks.pathname = "/dashboard";
    mocks.connection.isOnline = false;
    render(<ConnectivityControls />);
    expect(mocks.router.replace).toHaveBeenCalledWith("/offline");
  });

  it("syncs pending records explicitly while online", async () => {
    mocks.connection.pendingCount = 1;
    render(<ConnectivityControls />);
    await userEvent.click(screen.getByRole("button", { name: "Sync saved data" }));
    expect(mocks.connection.syncNow).toHaveBeenCalledOnce();
    expect(mocks.router.prefetch.mock.calls.map(([path]) => path)).toEqual(["/offline", "/report", "/my-reports", "/preparedness", "/resources"]);
  });
});
