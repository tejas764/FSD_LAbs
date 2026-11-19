import { apiClient, ApiError } from "@/lib/api/client";
import { getById, getPhotoBlob, listPending, patchReport, updateStatus } from "./queue";
import { isOfflineMode, MODE_CHANGE_EVENT } from "./mode";

type FetchFn = (url: string, config: RequestInit) => Promise<Response>;
type SubmitFn = (formData: FormData, idempotencyKey: string) => Promise<{ id: string }>;
type DelayFn = (ms: number) => Promise<void>;
const RETRY_LIMIT = 3;
const OPTIONAL_TEXT_FIELDS = new Set(["description", "pressingNeedsOther", "locationText"]);

export interface SyncQueueResult {
  total: number;
  succeeded: number;
  failed: number;
  syncedIds: string[];
  failedIds: string[];
}

export function getRetryDelayMs(retryCount: number): number {
  if (retryCount <= 1) return 60_000;
  if (retryCount === 2) return 5 * 60_000;
  if (retryCount === 3) return 15 * 60_000;
  if (retryCount === 4) return 60 * 60_000;
  if (retryCount === 5) return 6 * 60 * 60_000;
  return 24 * 60 * 60_000;
}

function buildFormDataPayload(fields: Record<string, unknown>, photoBlob: Blob): FormData {
  const formData = new FormData();
  formData.set("photo", photoBlob, "report-photo");
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined || key === "photo") continue;
    if (OPTIONAL_TEXT_FIELDS.has(key) && typeof value === "string" && !value.trim()) continue;
    formData.set(key, Array.isArray(value) || typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return formData;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown; message?: unknown };
    if (typeof data.error === "string") return data.error;
    if (data.error && typeof data.error === "object" && "message" in data.error && typeof data.error.message === "string") return data.error.message;
    if (typeof data.message === "string") return data.message;
  } catch {
    // An unavailable service may respond with HTML instead of JSON.
  }
  return `HTTP ${response.status}`;
}

function fetchSubmit(fetch: FetchFn): SubmitFn {
  return async (body, idempotencyKey) => {
    const response = await fetch("/api/v1/reports", {
      method: "POST",
      headers: { "X-Idempotency-Key": idempotencyKey },
      body,
      credentials: "include",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new ApiError(response.status, await parseErrorMessage(response));
    const result = await response.json() as { success?: boolean; data?: { id?: string } };
    if (result.success !== true || typeof result.data?.id !== "string" || !result.data.id) throw new Error("missing_server_acknowledgment");
    return { id: result.data.id };
  };
}

async function upload(id: string, submit: SubmitFn, force = false): Promise<"synced" | "failed" | "skipped"> {
  if (isOfflineMode()) return "skipped";
  const report = await getById(id);
  if (!report || report.status === "synced" || report.status === "draft") return "skipped";
  if (!force && (report.status === "failed" || (report.nextRetryAt ?? 0) > Date.now())) return "skipped";
  const idempotencyKey = report.idempotencyKey || crypto.randomUUID();
  await patchReport(id, { idempotencyKey, ...(force ? { retryCount: 0, nextRetryAt: undefined } : {}) });
  const photo = await getPhotoBlob(report.photoBlobKey);
  if (!photo) {
    await updateStatus(id, "failed", "missing_queue_payload");
    return "failed";
  }
  if (isOfflineMode()) return "skipped";
  await updateStatus(id, "syncing");
  try {
    const { id: serverId } = await submit(buildFormDataPayload(report.formDataSerialized, photo), idempotencyKey);
    if (!serverId) throw new Error("missing_server_acknowledgment");
    await patchReport(id, { serverId, status: "synced", lastError: null, nextRetryAt: undefined });
    return "synced";
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "Failed to sync";
    const retryCount = (await getById(id))?.retryCount ?? 1;
    const status = error instanceof ApiError ? error.status : 0;
    const permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;
    await patchReport(id, {
      status: permanent || retryCount >= RETRY_LIMIT ? "failed" : "queued",
      lastError: message,
      nextRetryAt: permanent ? undefined : Date.now() + getRetryDelayMs(retryCount),
    });
    return "failed";
  }
}

// All entry points share the browser lock, including legacy manual retries.
let activeSync: Promise<SyncQueueResult> | null = null;

function singleFlight(run: () => Promise<SyncQueueResult>): Promise<SyncQueueResult> {
  if (activeSync) return activeSync;
  const operation = typeof navigator !== "undefined" && navigator.locks?.request
    ? navigator.locks.request("crisismap-report-upload", run)
    : run();
  activeSync = operation.finally(() => { activeSync = null; });
  return activeSync;
}

/** One attempt per item. Durable retry deadlines avoid blocking later reports. */
export function syncQueue(
  submit: SubmitFn = apiClient.reports.submit,
  _delay?: DelayFn,
  options: { force?: boolean } = {},
): Promise<SyncQueueResult> {
  return singleFlight(async () => {
    const items = await listPending();
    const result: SyncQueueResult = { total: items.length, succeeded: 0, failed: 0, syncedIds: [], failedIds: [] };
    for (const item of items) {
      if (isOfflineMode()) break;
      const status = await upload(item.id, submit, options.force);
      if (status === "synced") {
        result.succeeded++;
        result.syncedIds.push(item.id);
      } else if (status === "failed" || item.status === "failed") {
        result.failed++;
        result.failedIds.push(item.id);
      }
    }
    return result;
  });
}

export async function syncReport(id: string, fetch: FetchFn): Promise<void> {
  await singleFlight(async () => {
    const state = await upload(id, fetchSubmit(fetch));
    return { total: 1, succeeded: state === "synced" ? 1 : 0, failed: state === "failed" ? 1 : 0, syncedIds: state === "synced" ? [id] : [], failedIds: state === "failed" ? [id] : [] };
  });
}

export async function drainQueue(fetch: FetchFn): Promise<void> {
  await syncQueue(fetchSubmit(fetch));
}

export async function retryReport(id: string, fetch: FetchFn): Promise<void> {
  await singleFlight(async () => {
    const state = await upload(id, fetchSubmit(fetch), true);
    return { total: 1, succeeded: state === "synced" ? 1 : 0, failed: state === "failed" ? 1 : 0, syncedIds: state === "synced" ? [id] : [], failedIds: state === "failed" ? [id] : [] };
  });
}

export async function registerBackgroundSync(tag = "crisismap-report-sync"): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncManager = (registration as ServiceWorkerRegistration & { sync?: { register: (syncTag: string) => Promise<void> } }).sync;
    if (!syncManager?.register) return false;
    await syncManager.register(tag);
    return true;
  } catch {
    return false;
  }
}

export function setupSyncTriggers(submit: SubmitFn = apiClient.reports.submit): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};
  const run = () => { if (!isOfflineMode()) void syncQueue(submit).catch(() => {}); };
  const onMessage = (event: MessageEvent<{ type?: string }>) => { if (event.data?.type === "SYNC_QUEUE") run(); };
  const onVisible = () => { if (document.visibilityState === "visible") run(); };
  const worker = navigator.serviceWorker;
  const hasMessages = typeof worker?.addEventListener === "function" && typeof worker?.removeEventListener === "function";
  window.addEventListener("online", run);
  window.addEventListener(MODE_CHANGE_EVENT, run);
  document.addEventListener("visibilitychange", onVisible);
  if (hasMessages) worker.addEventListener("message", onMessage);
  return () => {
    window.removeEventListener("online", run);
    window.removeEventListener(MODE_CHANGE_EVENT, run);
    document.removeEventListener("visibilitychange", onVisible);
    if (hasMessages) worker.removeEventListener("message", onMessage);
  };
}
