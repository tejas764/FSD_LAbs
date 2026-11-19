import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import { DATA_CHANGE_EVENT } from "./mode";

const DB_NAME = "crisismap-offline";
const DB_VERSION = 1;
const REPORTS_STORE = "pending-reports" as const;
const BLOBS_STORE = "report-blobs" as const;

export type ReportStatus = "draft" | "queued" | "syncing" | "synced" | "failed";

export interface QueuedReport {
  id: string;
  idempotencyKey: string; // UUID generated once at submit, reused on retry
  formDataSerialized: Record<string, unknown>;
  photoBlobKey: string; // Reference to blob store entry
  status: ReportStatus;
  createdAt: string; // ISO datetime
  retryCount: number;
  lastError: string | null;
  serverId?: string; // Server-assigned ID stored after successful sync
  nextRetryAt?: number;
}

export type OfflineQueueStatus = "pending" | "synced" | "failed";

export interface OfflineQueueItem {
  id: string;
  idempotencyKey: string;
  formDataSerialized: Record<string, unknown>;
  photoBlobKey: string;
  status: OfflineQueueStatus;
  retryCount: number;
  createdAt: string;
  lastError: string | null;
  serverId?: string; // Server-assigned ID stored after successful sync
}

interface OfflineDB extends DBSchema {
  "pending-reports": {
    key: string;
    value: QueuedReport;
    indexes: { byCreatedAt: string; byStatus: ReportStatus };
  };
  "report-blobs": {
    key: string;
    value: Blob;
  };
}

let _db: IDBPDatabase<OfflineDB> | null = null;
let opening: Promise<IDBPDatabase<OfflineDB>> | null = null;

function notifyChange(): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new Event(DATA_CHANGE_EVENT));
  }
  if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(DATA_CHANGE_EVENT);
    channel.postMessage({ changed: true });
    channel.close();
  }
}

async function getDb(): Promise<IDBPDatabase<OfflineDB>> {
  if (_db) return _db;
  if (!opening) {
    opening = openDB<OfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // pending-reports store
        if (!db.objectStoreNames.contains(REPORTS_STORE)) {
          const reportsStore = db.createObjectStore(REPORTS_STORE, {
            keyPath: "id",
          });
          reportsStore.createIndex("byStatus", "status");
          reportsStore.createIndex("byCreatedAt", "createdAt");
        }
        // report-blobs store for photo storage
        if (!db.objectStoreNames.contains(BLOBS_STORE)) {
          db.createObjectStore(BLOBS_STORE);
        }
      },
      blocking() {
        _db?.close();
        _db = null;
        opening = null;
      },
      terminated() {
        _db = null;
        opening = null;
      },
    }).then((db) => {
      _db = db;
      return db;
    }).catch((error: unknown) => {
      opening = null;
      throw error;
    });
  }
  return opening;
}

/**
 * Enqueue a report with idempotencyKey and initial status.
 * Returns the generated ID.
 */
export async function enqueue(
  report: Omit<QueuedReport, "id">,
): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const item: QueuedReport = { ...report, id };
  await db.add(REPORTS_STORE, item);
  notifyChange();
  return id;
}

/**
 * Get an item by ID.
 */
export async function getById(id: string): Promise<QueuedReport | undefined> {
  const db = await getDb();
  return db.get(REPORTS_STORE, id);
}

/**
 * Delete one queued report by ID.
 */
export async function dequeue(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([REPORTS_STORE, BLOBS_STORE], "readwrite");
  const report = await tx.objectStore(REPORTS_STORE).get(id);
  await tx.objectStore(REPORTS_STORE).delete(id);
  if (report?.photoBlobKey) await tx.objectStore(BLOBS_STORE).delete(report.photoBlobKey);
  await tx.done;
  notifyChange();
}

/**
 * Patch an existing queued report with partial fields.
 */
export async function patchReport(
  id: string,
  patch: Partial<QueuedReport>,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(REPORTS_STORE, "readwrite");
  const item = await tx.store.get(id);

  if (!item) {
    await tx.done;
    return;
  }

  await tx.store.put({ ...item, ...patch, id: item.id });
  await tx.done;
  notifyChange();
}

/**
 * List pending reports (queued or failed), sorted oldest-first by createdAt.
 * Does NOT include draft or synced reports.
 */
export async function listPending(): Promise<QueuedReport[]> {
  const db = await getDb();
  const tx = db.transaction(REPORTS_STORE, "readonly");
  const allByDate = await tx.store.index("byCreatedAt").getAll();

  return allByDate.filter(
    (r) => r.status === "queued" || r.status === "failed" || r.status === "syncing",
  );
}

/**
 * List all reports sorted by createdAt descending (newest first).
 */
export async function listAll(): Promise<QueuedReport[]> {
  const db = await getDb();
  const tx = db.transaction(REPORTS_STORE, "readonly");
  const allByDate = await tx.store.index("byCreatedAt").getAll();
  return [...allByDate].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

/**
 * Update a report's status and optional error message.
 * Increments retryCount when transitioning to "syncing".
 */
export async function updateStatus(
  id: string,
  status: ReportStatus,
  error?: string,
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(REPORTS_STORE, "readwrite");
  const item = await tx.store.get(id);

  if (!item) {
    await tx.done;
    return;
  }

  const updated: QueuedReport = {
    ...item,
    status,
    lastError: error ?? null,
    retryCount: status === "syncing" ? item.retryCount + 1 : item.retryCount,
  };

  await tx.store.put(updated);
  await tx.done;
  notifyChange();
}

/**
 * Delete all synced reports.
 */
export async function clearSynced(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction([REPORTS_STORE, BLOBS_STORE], "readwrite");
  let cursor = await tx.objectStore(REPORTS_STORE).openCursor();

  while (cursor) {
    if (cursor.value.status === "synced") {
      await tx.objectStore(BLOBS_STORE).delete(cursor.value.photoBlobKey);
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }

  await tx.done;
  notifyChange();
}

/**
 * Get the most recent draft report.
 * Returns null if no draft exists.
 */
export async function getDraft(): Promise<QueuedReport | null> {
  const db = await getDb();
  const tx = db.transaction(REPORTS_STORE, "readonly");
  const allByDate = await tx.store.index("byCreatedAt").getAll();

  const drafts = allByDate.filter((r) => r.status === "draft");
  return drafts.length > 0 ? drafts[drafts.length - 1] : null; // most recent
}

/**
 * Store a photo blob and return its key for later retrieval.
 */
export async function storePhotoBlob(blob: Blob): Promise<string> {
  const db = await getDb();
  const key = crypto.randomUUID();
  await db.put(BLOBS_STORE, blob, key);
  return key;
}

/**
 * Retrieve a photo blob by key.
 */
export async function getPhotoBlob(key: string): Promise<Blob | undefined> {
  const db = await getDb();
  return db.get(BLOBS_STORE, key);
}

/**
 * Delete a photo blob by key.
 */
export async function deletePhotoBlob(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(BLOBS_STORE, key);
}

// Fixed key used to persist the in-progress wizard photo across page refreshes.
const DRAFT_PHOTO_KEY = "__wizard_draft_photo__";

/**
 * Persist the wizard draft photo to IndexedDB so it survives page refresh.
 */
export async function saveDraftPhoto(blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put(BLOBS_STORE, blob, DRAFT_PHOTO_KEY);
}

/**
 * Retrieve the persisted wizard draft photo from IndexedDB.
 * Returns null if none exists.
 */
export async function loadDraftPhoto(): Promise<Blob | null> {
  const db = await getDb();
  const blob = await db.get(BLOBS_STORE, DRAFT_PHOTO_KEY);
  return blob ?? null;
}

/**
 * Remove the wizard draft photo from IndexedDB (call after successful submit).
 */
export async function clearDraftPhoto(): Promise<void> {
  const db = await getDb();
  await db.delete(BLOBS_STORE, DRAFT_PHOTO_KEY);
}

/**
 * Save a successfully-submitted report to IndexedDB as "synced", keyed by the
 * server-returned ID. This means My Reports can show full form data (infra
 * type, pressing needs, etc.) even for reports submitted while online.
 */
export async function saveSyncedReport(
  serverId: string,
  draft: Record<string, unknown>,
  photo: Blob,
): Promise<void> {
  const photoBlobKey = crypto.randomUUID();
  const db = await getDb();
  const item: QueuedReport = {
    id: serverId,
    serverId,
    idempotencyKey: serverId,
    formDataSerialized: draft,
    photoBlobKey,
    status: "synced",
    retryCount: 0,
    createdAt:
      typeof draft.collectedAt === "string"
        ? draft.collectedAt
        : new Date().toISOString(),
    lastError: null,
  };
  const tx = db.transaction([REPORTS_STORE, BLOBS_STORE], "readwrite");
  const previous = await tx.objectStore(REPORTS_STORE).get(serverId);
  if (previous?.photoBlobKey) await tx.objectStore(BLOBS_STORE).delete(previous.photoBlobKey);
  await tx.objectStore(BLOBS_STORE).put(photo, photoBlobKey);
  await tx.objectStore(REPORTS_STORE).put(item);
  await tx.done;
  notifyChange();
}

/**
 * Reset the IndexedDB handle (for testing).
 */
export function __resetDb(): void {
  _db?.close();
  _db = null;
  opening = null;
}

function toOfflineQueueStatus(status: ReportStatus): OfflineQueueStatus {
  if (status === "failed") {
    return "failed";
  }

  if (status === "synced") {
    return "synced";
  }

  return "pending";
}

function toOfflineQueueItem(item: QueuedReport): OfflineQueueItem {
  return {
    id: item.id,
    idempotencyKey: item.idempotencyKey,
    formDataSerialized: item.formDataSerialized,
    photoBlobKey: item.photoBlobKey,
    status: toOfflineQueueStatus(item.status),
    retryCount: item.retryCount,
    createdAt: item.createdAt,
    lastError: item.lastError,
    serverId: item.serverId,
  };
}

export async function enqueueReport(
  draft: Record<string, unknown>,
  photoBlob: Blob,
  idempotencyKey = crypto.randomUUID(),
): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const photoBlobKey = crypto.randomUUID();
  const report: QueuedReport = {
    id,
    idempotencyKey,
    formDataSerialized: draft,
    photoBlobKey,
    status: "queued",
    retryCount: 0,
    createdAt: new Date().toISOString(),
    lastError: null,
  };
  const tx = db.transaction([REPORTS_STORE, BLOBS_STORE], "readwrite");
  await tx.objectStore(BLOBS_STORE).put(photoBlob, photoBlobKey);
  await tx.objectStore(REPORTS_STORE).add(report);
  await tx.done;
  notifyChange();
  return id;
}

export async function dequeueAll(): Promise<OfflineQueueItem[]> {
  const pending = await listPending();
  return pending.map(toOfflineQueueItem);
}

export async function markSynced(id: string): Promise<void> {
  await updateStatus(id, "synced");
}

export async function markFailed(id: string, error: string): Promise<void> {
  const item = await getById(id);
  if (!item) {
    return;
  }

  await patchReport(id, {
    status: "failed",
    lastError: error,
    retryCount: item.retryCount + 1,
  });
}
