import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// register.ts uses window/navigator — both are undefined in Node.
// Tests cover the three observable behaviors:
//   1. safe no-op when APIs are absent (SSR / Node / old browser)
//   2. registers the SW at SW_URL when serviceWorker is present
//   3. setupOnlineSync calls drain when the "online" event fires

beforeEach(() => {
  vi.resetModules();
  // Restore any globals mutated during the previous test
  vi.unstubAllGlobals();
});

// ─── registerServiceWorker ──────────────────────────────────────────────────

describe("registerServiceWorker", () => {
  it("registers immediately when mounted after the load event", async () => {
    const register = vi.fn().mockResolvedValue({});
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    vi.stubGlobal("document", { readyState: "complete" });
    vi.stubGlobal("navigator", { serviceWorker: { register } });
    const { registerServiceWorker } = await import("./register");
    registerServiceWorker();
    await vi.waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
  });

  it("does not throw when window is undefined (SSR / Node)", async () => {
    // window is genuinely undefined in the node test environment
    const { registerServiceWorker } = await import("@/lib/offline/register");
    expect(() => registerServiceWorker()).not.toThrow();
  });

  it("does not throw when navigator.serviceWorker is absent", async () => {
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    vi.stubGlobal("navigator", {});
    const { registerServiceWorker } = await import("@/lib/offline/register");
    expect(() => registerServiceWorker()).not.toThrow();
  });

  it("registers the SW at the default /sw.js URL on load", async () => {
    const mockRegister = vi.fn().mockResolvedValue({});
    const listeners: Record<string, (() => void)[]> = {};

    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        (listeners[event] ??= []).push(handler);
      }),
    });
    vi.stubGlobal("navigator", {
      serviceWorker: { register: mockRegister },
    });

    const { registerServiceWorker } = await import("@/lib/offline/register");
    registerServiceWorker();

    // Simulate the load event firing
    for (const h of listeners["load"] ?? []) h();

    expect(mockRegister).toHaveBeenCalledWith("/sw.js");
  });

  it("accepts a custom SW URL", async () => {
    const mockRegister = vi.fn().mockResolvedValue({});
    const listeners: Record<string, (() => void)[]> = {};

    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        (listeners[event] ??= []).push(handler);
      }),
    });
    vi.stubGlobal("navigator", {
      serviceWorker: { register: mockRegister },
    });

    const { registerServiceWorker } = await import("@/lib/offline/register");
    registerServiceWorker("/custom-sw.js");
    for (const h of listeners["load"] ?? []) h();

    expect(mockRegister).toHaveBeenCalledWith("/custom-sw.js");
  });
});

// ─── setupOnlineSync ────────────────────────────────────────────────────────

describe("setupOnlineSync", () => {
  it("is a no-op and returns a cleanup fn when window is undefined", async () => {
    const { setupOnlineSync } = await import("@/lib/offline/register");
    const send = vi.fn();
    const cleanup = setupOnlineSync(send);
    expect(typeof cleanup).toBe("function");
    expect(() => cleanup()).not.toThrow();
  });

  it("calls drain when the online event fires", async () => {
    const listeners: Record<string, (() => void)[]> = {};
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        (listeners[event] ??= []).push(handler);
      }),
      removeEventListener: vi.fn(),
    });
    // IndexedDB must exist so drain doesn't throw
    const { IDBFactory } = await import("fake-indexeddb");
    vi.stubGlobal("indexedDB", new IDBFactory());

    const { setupOnlineSync } = await import("@/lib/offline/register");
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    setupOnlineSync(send);

    // Simulate coming back online — drain should be invoked
    for (const h of listeners["online"] ?? []) h();

    // drain is async; give it a tick to settle
    await new Promise((r) => setTimeout(r, 50));

    // send was NOT called because the queue is empty — but drain ran without error
    // Verify by enqueuing first, then firing online
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("calls send when online fires with a pending queue item", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    vi.stubGlobal("indexedDB", new IDBFactory());
    // Must import after indexedDB is set up
    const { enqueue, storePhotoBlob } = await import("@/lib/offline/queue");
    await enqueue({
      idempotencyKey: "uuid-register-test",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"])),
      status: "queued",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    });

    const listeners: Record<string, (() => void)[]> = {};
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        (listeners[event] ??= []).push(handler);
      }),
      removeEventListener: vi.fn(),
    });

    const { setupOnlineSync } = await import("@/lib/offline/register");
    const send = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { id: "remote" } }), { status: 201 }));
    setupOnlineSync(send);

    for (const h of listeners["online"] ?? []) h();
    await new Promise((r) => setTimeout(r, 50));

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns a cleanup function that removes the online listener", async () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      removeEventListener,
    });

    const { setupOnlineSync } = await import("@/lib/offline/register");
    const cleanup = setupOnlineSync(vi.fn());
    cleanup();

    expect(removeEventListener).toHaveBeenCalledWith(
      "online",
      expect.any(Function),
    );
  });
});
