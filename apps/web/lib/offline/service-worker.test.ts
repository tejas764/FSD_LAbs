import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const cache = { match: vi.fn(), put: vi.fn(), keys: vi.fn().mockResolvedValue([]), delete: vi.fn() };
  const fetch = vi.fn().mockImplementation(async () => new Response("asset"));
  runInNewContext(readFileSync(resolve("public/sw.js"), "utf8"), {
    self: { location: { origin: "https://crisismap.test" }, addEventListener: (name: string, handler: (event: Record<string, unknown>) => void) => listeners.set(name, handler) },
    caches: { open: vi.fn().mockResolvedValue(cache) },
    fetch, URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout,
  });
  return { listeners, cache, fetch };
}

describe("offline service worker", () => {
  it("never acknowledges an unpersisted POST as queued", () => {
    const { listeners, fetch } = worker();
    const respondWith = vi.fn();
    listeners.get("fetch")!({ request: new Request("https://crisismap.test/api/v1/reports", { method: "POST" }), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("caches immutable production chunks for offline hydration", async () => {
    const { listeners, fetch, cache } = worker();
    const respondWith = vi.fn();
    listeners.get("fetch")!({ request: new Request("https://crisismap.test/_next/static/chunks/example-123.js"), respondWith });
    const response = await respondWith.mock.calls[0][0];
    expect(response.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
  });

  it("never serves a document as a Flight response", () => {
    const { listeners } = worker();
    const respondWith = vi.fn();
    listeners.get("fetch")!({ request: new Request("https://crisismap.test/offline?_rsc=1", { headers: { RSC: "1" } }), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("keeps authenticated and dashboard API requests out of offline caches", () => {
    const { listeners } = worker();
    const respondWith = vi.fn();
    listeners.get("fetch")!({ request: new Request("https://crisismap.test/api/v1/crises", { headers: { Authorization: "Bearer test" } }), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
    listeners.get("fetch")!({ request: new Request("https://crisismap.test/api/v1/crises", { referrer: "https://crisismap.test/dashboard/moderation" }), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("serves the cached public workspace when navigating offline from a dashboard", async () => {
    const { listeners, cache, fetch } = worker();
    fetch.mockRejectedValue(new TypeError("Offline"));
    cache.match.mockImplementation(async (key: string) => key === "/offline" ? new Response("offline workspace") : undefined);
    const request = new Request("https://crisismap.test/offline", { referrer: "https://crisismap.test/dashboard" });
    Object.defineProperty(request, "mode", { value: "navigate" });
    const respondWith = vi.fn();
    listeners.get("fetch")!({ request, respondWith });
    expect(respondWith).toHaveBeenCalledTimes(1);
    expect(await (await respondWith.mock.calls[0][0]).text()).toBe("offline workspace");
  });

  it("never caches report lists that may contain session-specific fields", () => {
    const { listeners } = worker();
    const respondWith = vi.fn();
    listeners.get("fetch")!({ request: new Request("https://crisismap.test/api/v1/reports"), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("keeps protected crisis modular fields out of the public reference cache", () => {
    const { listeners } = worker();
    const respondWith = vi.fn();
    listeners.get("fetch")!({ request: new Request("https://crisismap.test/api/v1/crises/modular-fields"), respondWith });
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("reports cached readiness to a newly opened page", async () => {
    const { listeners, cache } = worker();
    cache.match.mockResolvedValue(new Response("offline shell"));
    const postMessage = vi.fn();
    const waitUntil = vi.fn();
    listeners.get("message")!({ data: { type: "CHECK_OFFLINE_READY" }, source: { postMessage }, waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(postMessage).toHaveBeenCalledWith({ type: "OFFLINE_READY", ready: true });
  });

  it("does not report readiness when the HTML shell is missing a hydration chunk", async () => {
    const { listeners, cache } = worker();
    cache.match.mockImplementation(async (key: string) => key === "/offline" ? new Response('<script src="/_next/static/missing.js"></script>') : undefined);
    const postMessage = vi.fn();
    const waitUntil = vi.fn();
    listeners.get("message")!({ data: { type: "CHECK_OFFLINE_READY" }, source: { postMessage }, waitUntil });
    await waitUntil.mock.calls[0][0];
    expect(postMessage).toHaveBeenCalledWith({ type: "OFFLINE_READY", ready: false });
  });
});
