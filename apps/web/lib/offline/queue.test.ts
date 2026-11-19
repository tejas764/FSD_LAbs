import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it, beforeEach } from "vitest";
import {
  enqueue,
  enqueueReport,
  listPending,
  dequeueAll,
  markSynced,
  markFailed,
  updateStatus,
  patchReport,
  dequeue,
  clearSynced,
  getDraft,
  getById,
  storePhotoBlob,
  getPhotoBlob,
  deletePhotoBlob,
  __resetDb,
} from "./queue";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  __resetDb();
});

describe("enqueue", () => {
  it("persists the report and photo together and removes both on deletion", async () => {
    const id = await enqueueReport({ description: "local report" }, new Blob(["photo"]));
    const report = await getById(id);
    expect(report).toBeDefined();
    expect(await getPhotoBlob(report!.photoBlobKey)).toBeDefined();
    await dequeue(id);
    expect(await getById(id)).toBeUndefined();
    expect(await getPhotoBlob(report!.photoBlobKey)).toBeUndefined();
  });

  it("makes interrupted syncing records recoverable", async () => {
    const id = await enqueueReport({}, new Blob(["photo"]));
    await updateStatus(id, "syncing");
    expect((await listPending()).map((item) => item.id)).toContain(id);
  });

  it("stores report with idempotencyKey and returns id", async () => {
    const mockReport = {
      idempotencyKey: "test-uuid-1",
      formDataSerialized: { crisisId: "crisis-1", damageLevel: "MINIMAL" },
      photoBlobKey: "photo-blob-1",
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id = await enqueue(mockReport);

    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);

    const stored = await getById(id);
    expect(stored).toEqual({
      id,
      ...mockReport,
    });
  });

  it("generates unique ids for multiple reports", async () => {
    const report1 = {
      idempotencyKey: "uuid-1",
      formDataSerialized: {},
      photoBlobKey: "blob-1",
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const report2 = {
      idempotencyKey: "uuid-2",
      formDataSerialized: {},
      photoBlobKey: "blob-2",
      status: "queued" as const,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const id1 = await enqueue(report1);
    const id2 = await enqueue(report2);

    expect(id1).not.toBe(id2);
  });
});

describe("dequeue", () => {
  it("removes one queued report by id", async () => {
    const id = await enqueue({
      idempotencyKey: "uuid-1",
      formDataSerialized: {},
      photoBlobKey: "blob",
      status: "queued",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    });

    await dequeue(id);

    const found = await getById(id);
    expect(found).toBeUndefined();
  });
});

describe("patchReport", () => {
  it("updates selected fields without changing id", async () => {
    const id = await enqueue({
      idempotencyKey: "",
      formDataSerialized: { crisisId: "c1" },
      photoBlobKey: "blob",
      status: "queued",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    });

    await patchReport(id, {
      idempotencyKey: "uuid-generated",
      status: "syncing",
    });

    const found = await getById(id);
    expect(found?.id).toBe(id);
    expect(found?.idempotencyKey).toBe("uuid-generated");
    expect(found?.status).toBe("syncing");
  });
});

describe("listPending", () => {
  it("returns only queued and failed items, not drafts or synced", async () => {
    const baseReport = {
      formDataSerialized: {},
      photoBlobKey: "blob",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const queuedId = await enqueue({
      idempotencyKey: "uuid-1",
      status: "queued",
      ...baseReport,
    });

    await enqueue({
      idempotencyKey: "uuid-2",
      status: "draft",
      ...baseReport,
    });

    await enqueue({
      idempotencyKey: "uuid-3",
      status: "synced",
      ...baseReport,
    });

    const failedId = await enqueue({
      idempotencyKey: "uuid-4",
      status: "failed",
      ...baseReport,
    });

    const pending = await listPending();

    expect(pending).toHaveLength(2);
    expect(pending.map((r) => r.id)).toEqual(
      expect.arrayContaining([queuedId, failedId]),
    );
    expect(
      pending.every((r) => r.status === "queued" || r.status === "failed"),
    ).toBe(true);
  });

  it("returns empty array when no pending reports", async () => {
    const pending = await listPending();
    expect(pending).toEqual([]);
  });

  it("returns pending reports sorted by creation date (oldest first)", async () => {
    const baseReport = {
      formDataSerialized: {},
      photoBlobKey: "blob",
      retryCount: 0,
      lastError: null,
      status: "queued" as const,
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

    const pending = await listPending();

    expect(pending[0].id).toBe(id2);
    expect(pending[1].id).toBe(id1);
  });
});

describe("updateStatus", () => {
  it("updates status and clears error on success", async () => {
    const id = await enqueue({
      idempotencyKey: "uuid-1",
      formDataSerialized: {},
      photoBlobKey: "blob",
      status: "queued",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: "Previous error",
    });

    await updateStatus(id, "synced");

    const updated = await getById(id);

    expect(updated?.status).toBe("synced");
    expect(updated?.lastError).toBeNull();
  });

  it("updates status and sets error message on failure", async () => {
    const id = await enqueue({
      idempotencyKey: "uuid-1",
      formDataSerialized: {},
      photoBlobKey: "blob",
      status: "queued",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    });

    await updateStatus(id, "failed", "Network timeout");

    const updated = await getById(id);

    expect(updated?.status).toBe("failed");
    expect(updated?.lastError).toBe("Network timeout");
  });

  it("increments retry count when transitioning to syncing", async () => {
    const id = await enqueue({
      idempotencyKey: "uuid-1",
      formDataSerialized: {},
      photoBlobKey: "blob",
      status: "queued",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    });

    await updateStatus(id, "syncing");

    const updated = await getById(id);

    expect(updated?.retryCount).toBe(1);
  });
});

describe("clearSynced", () => {
  it("removes only synced items", async () => {
    const baseReport = {
      formDataSerialized: {},
      photoBlobKey: "blob",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    const queuedId = await enqueue({
      idempotencyKey: "uuid-1",
      status: "queued",
      ...baseReport,
    });

    const syncedId = await enqueue({
      idempotencyKey: "uuid-2",
      status: "synced",
      ...baseReport,
    });

    const failedId = await enqueue({
      idempotencyKey: "uuid-3",
      status: "failed",
      ...baseReport,
    });

    await clearSynced();

    const pending = await listPending();
    const queued = await getById(queuedId);
    const synced = await getById(syncedId);
    const failed = await getById(failedId);

    expect(queued).toBeTruthy();
    expect(synced).toBeUndefined();
    expect(failed).toBeTruthy();
    expect(pending.map((r) => r.id)).toEqual(
      expect.arrayContaining([queuedId, failedId]),
    );
  });
});

describe("getDraft", () => {
  it("returns most recent draft by createdAt", async () => {
    const baseReport = {
      formDataSerialized: { step: 0 },
      photoBlobKey: "blob",
      retryCount: 0,
      lastError: null,
      status: "draft" as const,
      idempotencyKey: "uuid-draft",
    };

    const olderDate = new Date("2026-04-01T10:00:00Z").toISOString();
    const newerDate = new Date("2026-04-01T11:00:00Z").toISOString();

    await enqueue({
      createdAt: olderDate,
      ...baseReport,
    });

    const newerDraftId = await enqueue({
      createdAt: newerDate,
      ...baseReport,
    });

    await enqueue({
      idempotencyKey: "uuid-queued",
      createdAt: newerDate,
      status: "queued",
      formDataSerialized: {},
      photoBlobKey: "blob",
      retryCount: 0,
      lastError: null,
    });

    const draft = await getDraft();

    expect(draft?.id).toBe(newerDraftId);
    expect(draft?.status).toBe("draft");
  });

  it("returns null when no draft exists", async () => {
    const draft = await getDraft();
    expect(draft).toBeNull();
  });

  it("returns null when only synced/queued items exist", async () => {
    const baseReport = {
      formDataSerialized: {},
      photoBlobKey: "blob",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    };

    await enqueue({
      idempotencyKey: "uuid-1",
      status: "synced",
      ...baseReport,
    });

    await enqueue({
      idempotencyKey: "uuid-2",
      status: "queued",
      ...baseReport,
    });

    const draft = await getDraft();
    expect(draft).toBeNull();
  });
});

describe("photo blob storage", () => {
  it("stores and retrieves photo blob", async () => {
    const blob = new Blob(["test data"], { type: "image/webp" });
    const key = await storePhotoBlob(blob);

    const retrieved = await getPhotoBlob(key);

    expect(retrieved).toBeTruthy();
    expect(retrieved?.size).toBe(blob.size);
    expect(retrieved?.type).toBe("image/webp");
  });

  it("deletes photo blob", async () => {
    const blob = new Blob(["test data"], { type: "image/webp" });
    const key = await storePhotoBlob(blob);

    await deletePhotoBlob(key);

    const retrieved = await getPhotoBlob(key);
    expect(retrieved).toBeUndefined();
  });
});

describe("queue task API wrappers", () => {
  it("enqueueReport stores blob and creates pending queue item", async () => {
    const photoBlob = new Blob(["photo-bytes"], { type: "image/webp" });
    const id = await enqueueReport(
      {
        crisisId: "crisis-1",
        damageLevel: "MINIMAL",
      },
      photoBlob,
    );

    const queued = await getById(id);
    expect(queued).toBeTruthy();
    expect(queued?.status).toBe("queued");
    expect(queued?.formDataSerialized).toEqual({
      crisisId: "crisis-1",
      damageLevel: "MINIMAL",
    });

    const blob = await getPhotoBlob(queued!.photoBlobKey);
    expect(blob?.size).toBe(photoBlob.size);
    expect(blob?.type).toBe("image/webp");
  });

  it("dequeueAll returns only pending-style queue items", async () => {
    const pendingId = await enqueueReport({ crisisId: "c-1" }, new Blob(["a"]));
    const syncedId = await enqueue({
      idempotencyKey: "uuid-synced",
      formDataSerialized: { crisisId: "c-2" },
      photoBlobKey: "blob-synced",
      status: "synced",
      createdAt: new Date().toISOString(),
      retryCount: 0,
      lastError: null,
    });

    const all = await dequeueAll();

    expect(all.map((item) => item.id)).toContain(pendingId);
    expect(all.map((item) => item.id)).not.toContain(syncedId);
    expect(all.every((item) => item.status === "pending" || item.status === "failed")).toBe(true);
  });

  it("markSynced updates queued item to synced", async () => {
    const id = await enqueueReport({ crisisId: "c-1" }, new Blob(["a"]));

    await markSynced(id);

    const item = await getById(id);
    expect(item?.status).toBe("synced");
  });

  it("markFailed updates queued item to failed and increments retry count", async () => {
    const id = await enqueueReport({ crisisId: "c-1" }, new Blob(["a"]));

    await markFailed(id, "network_error");

    const item = await getById(id);
    expect(item?.status).toBe("failed");
    expect(item?.lastError).toBe("network_error");
    expect(item?.retryCount).toBe(1);
  });
});
