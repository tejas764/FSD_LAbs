import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  syncReport,
  drainQueue,
  syncQueue,
  setupSyncTriggers,
  retryReport,
  getRetryDelayMs,
  registerBackgroundSync,
} from "./sync";
import { enqueue, enqueueReport, getById, listPending, storePhotoBlob, patchReport, __resetDb } from "./queue";
import { isOfflineMode } from "./mode";
import { ApiError } from "@/lib/api/client";

vi.mock("./mode", () => ({
  isOfflineMode: vi.fn(() => false),
  MODE_CHANGE_EVENT: "crisismap:mode-change",
  DATA_CHANGE_EVENT: "crisismap:data-change",
}));

beforeEach(() => {
  vi.unstubAllGlobals();
  globalThis.indexedDB = new IDBFactory();
  __resetDb();
  vi.clearAllMocks();
  vi.mocked(isOfflineMode).mockReturnValue(false);
});

describe("syncReport", () => {
  it("generates idempotencyKey if empty string", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { id: "report-1" } }),
        {
          status: 201,
        },
      ),
    );

    const report = {
      idempotencyKey: "",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id = await enqueue(report);
    await syncReport(id, mockFetch);

    const updated = await getById(id);
    expect(updated?.idempotencyKey).not.toBe("");
    expect(updated?.idempotencyKey.length).toBeGreaterThan(0);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Idempotency-Key": updated?.idempotencyKey,
        }),
      }),
    );
  });

  it("marks report synced on 201 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { id: "report-1" } }),
        {
          status: 201,
        },
      ),
    );

    const report = {
      idempotencyKey: "uuid-123",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id = await enqueue(report);
    await syncReport(id, mockFetch);

    const updated = await getById(id);
    expect(updated?.status).toBe("synced");
    expect(updated?.lastError).toBeNull();
  });

  it("marks report synced on 200 response (idempotent replay)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { id: "report-1" } }),
        {
          status: 200,
        },
      ),
    );

    const report = {
      idempotencyKey: "uuid-123",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id = await enqueue(report);
    await syncReport(id, mockFetch);

    const updated = await getById(id);
    expect(updated?.status).toBe("synced");
    expect(updated?.lastError).toBeNull();
  });

  it("marks report failed on 400/422 validation error", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: "Invalid crisis ID" }),
        {
          status: 400,
        },
      ),
    );

    const report = {
      idempotencyKey: "uuid-123",
      formDataSerialized: { crisisId: "invalid" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id = await enqueue(report);
    await syncReport(id, mockFetch);

    const updated = await getById(id);
    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBeTruthy();
  });

  it("keeps report queued on 429 rate limit", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: "Rate limit exceeded" }),
        {
          status: 429,
        },
      ),
    );

    const report = {
      idempotencyKey: "uuid-123",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id = await enqueue(report);
    await syncReport(id, mockFetch);

    const updated = await getById(id);
    expect(updated?.status).toBe("queued");
  });

  it("keeps report queued on network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const report = {
      idempotencyKey: "uuid-123",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id = await enqueue(report);
    await syncReport(id, mockFetch);

    const updated = await getById(id);
    expect(updated?.status).toBe("queued");
    expect(updated?.lastError).toBeTruthy();
  });

  it("includes X-Idempotency-Key header in request", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { id: "report-1" } }),
        {
          status: 201,
        },
      ),
    );

    const report = {
      idempotencyKey: "my-unique-uuid",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id = await enqueue(report);
    await syncReport(id, mockFetch);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Idempotency-Key": "my-unique-uuid",
        }),
      }),
    );
  });

  it("increments retry count when transitioning to syncing", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { id: "report-1" } }),
        {
          status: 201,
        },
      ),
    );

    const report = {
      idempotencyKey: "uuid-123",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id = await enqueue(report);
    await syncReport(id, mockFetch);

    const updated = await getById(id);
    expect(updated?.retryCount).toBe(1);
  });

  it("marks report failed after 3 consecutive retriable failures", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const id = await enqueue({
      idempotencyKey: "uuid-123",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued",
      createdAt: new Date().toISOString(),
      retryCount: 2,
      lastError: null,
    });

    await syncReport(id, mockFetch);

    const updated = await getById(id);
    expect(updated?.retryCount).toBe(3);
    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBe("Network error");
  });
});

describe("drainQueue", () => {
  it("syncs all queued reports in order", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { id: "report-1" } }),
        {
          status: 201,
        },
      ),
    );

    const baseReport = {
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      retryCount: 0,
      lastError: null,
    };

    const date1 = new Date("2026-04-01T10:00:00Z").toISOString();
    const date2 = new Date("2026-04-01T11:00:00Z").toISOString();

    const id1 = await enqueue({
      idempotencyKey: "uuid-1",
      createdAt: date2,
      ...baseReport,
    });

    const id2 = await enqueue({
      idempotencyKey: "uuid-2",
      createdAt: date1,
      ...baseReport,
    });

    mockFetch.mockImplementation(async () => new Response(JSON.stringify({ success: true, data: { id: "report-1" } }), { status: 201 }));
    await drainQueue(mockFetch);

    const pending = await listPending();
    expect(pending).toHaveLength(0);

    const report1 = await getById(id1);
    const report2 = await getById(id2);
    expect(report1?.status).toBe("synced");
    expect(report2?.status).toBe("synced");

    const calls = mockFetch.mock.calls;
    expect(calls[0][1].headers["X-Idempotency-Key"]).toBe("uuid-2");
    expect(calls[1][1].headers["X-Idempotency-Key"]).toBe("uuid-1");
  });

  it("continues processing after failed report", async () => {
    const mockFetch = vi.fn();

    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: false, error: "Validation error" }),
          {
            status: 400,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { id: "report-2" } }),
          {
            status: 201,
          },
        ),
      );

    const baseReport = {
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued" as const,
      retryCount: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    };

    const id1 = await enqueue({
      idempotencyKey: "uuid-1",
      ...baseReport,
    });

    const id2 = await enqueue({
      idempotencyKey: "uuid-2",
      ...baseReport,
    });

    await drainQueue(mockFetch);

    const report1 = await getById(id1);
    const report2 = await getById(id2);

    expect([report1?.status, report2?.status].sort()).toEqual([
      "failed",
      "synced",
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("retryReport", () => {
  it("resets status and retries one failed report", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { id: "report-1" } }),
        {
          status: 201,
        },
      ),
    );

    const id = await enqueue({
      idempotencyKey: "uuid-1",
      formDataSerialized: { crisisId: "crisis-1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "failed",
      createdAt: new Date().toISOString(),
      retryCount: 3,
      lastError: "Validation error",
    });

    await retryReport(id, mockFetch);

    const updated = await getById(id);
    expect(updated?.status).toBe("synced");
    expect(updated?.lastError).toBeNull();
    expect(updated?.retryCount).toBe(1);
  });
});

describe("getRetryDelayMs", () => {
  it("returns expected exponential retry schedule", () => {
    expect(getRetryDelayMs(1)).toBe(60_000);
    expect(getRetryDelayMs(2)).toBe(300_000);
    expect(getRetryDelayMs(3)).toBe(900_000);
    expect(getRetryDelayMs(4)).toBe(3_600_000);
    expect(getRetryDelayMs(5)).toBe(21_600_000);
    expect(getRetryDelayMs(99)).toBe(86_400_000);
  });
});

describe("registerBackgroundSync", () => {
  it("returns false when service worker is unavailable", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    await expect(registerBackgroundSync()).resolves.toBe(false);
  });

  it("registers sync tag when sync manager is available", async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          sync: {
            register,
          },
        }),
      },
    });

    await expect(registerBackgroundSync()).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith("crisismap-report-sync");
  });
});

describe("syncQueue", () => {
  it("omits optional blank text from multipart retries while preserving report fields", async () => {
    await enqueueReport({
      description: "",
      pressingNeedsOther: "  ",
      locationText: "\n",
      infraName: "Bridge A",
      pressingNeeds: ["FOOD_WATER"],
    }, new Blob(["photo"]));
    const submit = vi.fn().mockResolvedValue({ id: "remote" });
    await syncQueue(submit);
    const payload = submit.mock.calls[0][0] as FormData;
    expect(payload.has("description")).toBe(false);
    expect(payload.has("pressingNeedsOther")).toBe(false);
    expect(payload.has("locationText")).toBe(false);
    expect(payload.get("infraName")).toBe("Bridge A");
    expect(payload.get("pressingNeeds")).toBe('["FOOD_WATER"]');
    expect(payload.get("photo")).toBeInstanceOf(Blob);
  });

  it("keeps permanent validation failures for explicit retry", async () => {
    const id = await enqueueReport({}, new Blob(["photo"]));
    const submit = vi.fn().mockRejectedValueOnce(new ApiError(422, "Invalid crisis")).mockResolvedValue({ id: "remote" });
    await syncQueue(submit);
    expect((await getById(id))?.status).toBe("failed");
    await syncQueue(submit);
    expect(submit).toHaveBeenCalledTimes(1);
    await syncQueue(submit, undefined, { force: true });
    expect(submit).toHaveBeenCalledTimes(2);
    expect((await getById(id))?.status).toBe("synced");
  });

  it("stops before the next report when the user selects offline during an upload", async () => {
    const first = await enqueueReport({}, new Blob(["first"]));
    const second = await enqueueReport({}, new Blob(["second"]));
    await patchReport(first, { createdAt: "2026-04-01T10:00:00.000Z" });
    await patchReport(second, { createdAt: "2026-04-01T11:00:00.000Z" });
    const submit = vi.fn(async () => { vi.mocked(isOfflineMode).mockReturnValue(true); return { id: "remote" }; });
    await syncQueue(submit);
    expect(submit).toHaveBeenCalledTimes(1);
    expect((await getById(second))?.status).toBe("queued");
  });

  it("does not upload when offline is selected", async () => {
    await enqueueReport({}, new Blob(["photo"]));
    vi.mocked(isOfflineMode).mockReturnValue(true);
    const submit = vi.fn();
    const result = await syncQueue(submit);
    expect(submit).not.toHaveBeenCalled();
    expect(result.succeeded).toBe(0);
  });

  it("shares one active drain and uploads a queued item once", async () => {
    await enqueueReport({}, new Blob(["photo"]));
    const submit = vi.fn().mockResolvedValue({ id: "remote" });
    await Promise.all([syncQueue(submit), syncQueue(submit), syncQueue(submit)]);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("persists backoff without sleeping and lets later reports upload", async () => {
    const first = await enqueueReport({}, new Blob(["photo"]));
    const second = await enqueueReport({}, new Blob(["photo"]));
    await patchReport(first, { createdAt: "2026-04-01T10:00:00.000Z" });
    await patchReport(second, { createdAt: "2026-04-01T11:00:00.000Z" });
    const submit = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue({ id: "remote" });
    const delay = vi.fn();
    await syncQueue(submit, delay);
    expect(delay).not.toHaveBeenCalled();
    expect((await getById(first))?.nextRetryAt).toBeGreaterThan(Date.now());
    expect((await getById(second))?.status).toBe("synced");
    await syncQueue(submit);
    expect(submit).toHaveBeenCalledTimes(2);
  });

  it("recovers an interrupted sync with its original idempotency key", async () => {
    const id = await enqueueReport({}, new Blob(["photo"]), "stable-key");
    await patchReport(id, { status: "syncing" });
    const submit = vi.fn().mockResolvedValue({ id: "remote" });
    await syncQueue(submit);
    expect(submit).toHaveBeenCalledWith(expect.any(FormData), "stable-key");
    expect((await getById(id))?.status).toBe("synced");
  });

  it("returns a summary and marks successful items synced", async () => {
    const submit = vi.fn().mockResolvedValue({ id: "remote-1" });
    const id = await enqueueReport(
      { crisisId: "c1", damageLevel: "MINIMAL" },
      new Blob(["photo"], { type: "image/webp" }),
    );

    const result = await syncQueue(submit);

    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.syncedIds).toEqual([id]);
  });

  it("stores the server-returned id as serverId on the queue item after sync", async () => {
    const submit = vi.fn().mockResolvedValue({ id: "server-uuid-abc" });
    const localId = await enqueueReport(
      { crisisId: "c1", damageLevel: "MINIMAL" },
      new Blob(["photo"], { type: "image/webp" }),
    );

    await syncQueue(submit);

    const updated = await getById(localId);
    expect(updated?.status).toBe("synced");
    expect(updated?.serverId).toBe("server-uuid-abc");
  });

  it("stops auto retry after 3 failed attempts", async () => {
    const submit = vi.fn().mockRejectedValue(new Error("offline"));
    const id = await enqueue({
      idempotencyKey: "uuid-s2",
      formDataSerialized: { crisisId: "c1" },
      photoBlobKey: await storePhotoBlob(new Blob(["photo"], { type: "image/webp" })),
      status: "queued",
      createdAt: new Date().toISOString(),
      retryCount: 2,
      lastError: null,
    });

    const result = await syncQueue(submit);
    const updated = await getById(id);

    expect(result.total).toBe(1);
    expect(result.failed).toBe(1);
    expect(updated?.retryCount).toBe(3);
    expect(updated?.status).toBe("failed");
  });
});

describe("setupSyncTriggers", () => {
  it("runs sync when browser comes online", async () => {
    const listeners = new Map<string, Set<() => void>>();
    const add = (event: string, handler: () => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(handler);
    };
    const remove = (event: string, handler: () => void) => {
      listeners.get(event)?.delete(handler);
    };

    vi.stubGlobal("window", {
      addEventListener: add,
      removeEventListener: remove,
      dispatchEvent: (event: Event) => {
        for (const handler of listeners.get(event.type) ?? []) {
          handler();
        }
        return true;
      },
    });
    vi.stubGlobal("document", {
      visibilityState: "visible",
      addEventListener: add,
      removeEventListener: remove,
    });
    Object.defineProperty(globalThis.navigator, "onLine", {
      configurable: true,
      value: true,
    });

    await enqueue({
      idempotencyKey: "uuid-online",
      formDataSerialized: { crisisId: "c1" },
      photoBlobKey: await (await import("./queue")).storePhotoBlob(
        new Blob(["photo"], { type: "image/webp" }),
      ),
      status: "queued",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    });

    const submit = vi.fn().mockResolvedValue({ id: "remote-1" });
    const cleanup = setupSyncTriggers(submit);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    cleanup();
  });
});
