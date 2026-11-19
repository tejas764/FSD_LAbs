// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getModePreference, isOfflineMode, setApiReachable, setModePreference, MODE_CHANGE_EVENT } from "./mode";

describe("shared connectivity preference", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    setApiReachable(true);
    setModePreference("online");
  });
  it("persists manual offline mode and notifies mounted consumers", () => {
    const listener = vi.fn();
    window.addEventListener(MODE_CHANGE_EVENT, listener);
    setModePreference("offline");
    expect(getModePreference()).toBe("offline");
    expect(isOfflineMode()).toBe(true);
    expect(listener).toHaveBeenCalled();
    window.removeEventListener(MODE_CHANGE_EVENT, listener);
  });
  it("uses offline mode when the network or API is unavailable", () => {
    setApiReachable(false);
    expect(isOfflineMode()).toBe(true);
    setApiReachable(true);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(isOfflineMode()).toBe(true);
  });
});
