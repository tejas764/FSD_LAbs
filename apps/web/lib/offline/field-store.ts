import { openDB, type DBSchema } from "idb";
import { z } from "zod";
import { isOfflineMode, DATA_CHANGE_EVENT } from "./mode";
import { enqueueReport, getPhotoBlob, listAll, patchReport } from "./queue";

export const FIELD_DATA_EVENT = "crisismap:field-data";
const MAX_PACKET_BYTES = 25 * 1024 * 1024;
const MessageSchema = z.object({
  id: z.uuid(), deviceId: z.uuid(), content: z.string().trim().min(1).max(2000),
  type: z.enum(["TEXT", "SOS"]), createdAt: z.iso.datetime(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
}).refine((m) => (m.latitude != null) === (m.longitude != null), "Both coordinates are required");
export type FieldMessage = z.infer<typeof MessageSchema> & {
  status: "queued" | "synced" | "failed";
  receivedAt?: string; lastError?: string | null; retryCount?: number; nextRetryAt?: number;
};
interface FieldDB extends DBSchema {
  messages: { key: string; value: FieldMessage };
  metadata: { key: string; value: string };
}
const database = () => openDB<FieldDB>("crisismap-field", 1, {
  upgrade(db) { db.createObjectStore("messages", { keyPath: "id" }); db.createObjectStore("metadata"); },
});
let dbPromise: ReturnType<typeof database> | null = null;
function getDB() { return dbPromise ??= database().catch((error) => { dbPromise = null; throw error; }); }
function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(FIELD_DATA_EVENT));
  window.dispatchEvent(new Event(DATA_CHANGE_EVENT));
  try { localStorage.setItem(FIELD_DATA_EVENT, `${Date.now()}:${crypto.randomUUID()}`); } catch { /* Local events work without storage. */ }
}
export async function getFieldDeviceId(): Promise<string> {
  const db = await getDB();
  const tx = db.transaction("metadata", "readwrite");
  let id = await tx.store.get("deviceId");
  if (!id) { id = crypto.randomUUID(); await tx.store.put(id, "deviceId"); }
  await tx.done;
  return id;
}
export async function listFieldMessages(): Promise<FieldMessage[]> {
  return (await (await getDB()).getAll("messages")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function queueFieldMessage(content: string, type: "TEXT" | "SOS", location?: { latitude: number; longitude: number }): Promise<string> {
  const value = MessageSchema.parse({ id: crypto.randomUUID(), deviceId: await getFieldDeviceId(), content, type, createdAt: new Date().toISOString(), ...location });
  await (await getDB()).add("messages", { ...value, status: "queued", retryCount: 0 });
  notify();
  return value.id;
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
interface FieldSyncResult { uploaded: number; downloaded: number; failed: number; pulled: boolean }
let flight: Promise<FieldSyncResult> | null = null;
export function syncFieldMessages(fetcher: Fetcher = fetch, force = false): Promise<FieldSyncResult> {
  if (flight) return flight;
  const run = async () => {
    const result: FieldSyncResult = { uploaded: 0, downloaded: 0, failed: 0, pulled: false };
    let changed = false;
    const db = await getDB();
    for (const item of [...await listFieldMessages()].reverse()) {
      if (isOfflineMode()) break;
      if (item.status === "synced" || (!force && (item.status === "failed" || (item.nextRetryAt ?? 0) > Date.now()))) continue;
      try {
        const payload = MessageSchema.parse(item);
        if (payload.latitude == null) { delete payload.latitude; delete payload.longitude; }
        const response = await fetcher("/api/v1/field-messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), cache: "no-store",
        });
        if (!response.ok) {
          const permanent = response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status);
          const retryCount = (item.retryCount ?? 0) + 1;
          await db.put("messages", { ...item, status: permanent ? "failed" : "queued", lastError: `HTTP ${response.status}`, retryCount, nextRetryAt: Date.now() + Math.min(300000, 10000 * 2 ** Math.min(retryCount, 5)) });
          result.failed++; changed = true;
          if (!permanent) break;
          continue;
        }
        const ack = z.object({ success: z.literal(true), data: MessageSchema.safeExtend({ receivedAt: z.iso.datetime() }) }).parse(await response.json());
        if (ack.data.id !== item.id || ack.data.deviceId !== item.deviceId) throw new Error("Invalid message acknowledgment");
        await db.put("messages", { ...item, ...ack.data, status: "synced", lastError: null, nextRetryAt: undefined });
        result.uploaded++; changed = true;
      } catch (error) {
        await db.put("messages", { ...item, status: "queued", lastError: error instanceof Error ? error.message : "Upload unavailable", retryCount: (item.retryCount ?? 0) + 1, nextRetryAt: Date.now() + 30000 });
        result.failed++; changed = true;
        break;
      }
    }
    if (!isOfflineMode()) {
      try {
        const deviceId = await getFieldDeviceId();
        const response = await fetcher(`/api/v1/field-messages?deviceId=${encodeURIComponent(deviceId)}`, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const ack = z.object({ success: z.literal(true), data: z.array(MessageSchema.safeExtend({ receivedAt: z.iso.datetime() })).max(200) }).parse(await response.json());
        if (ack.data.some((m) => m.deviceId !== deviceId)) throw new Error("Invalid device in message history");
        for (const message of ack.data) {
          const existing = await db.get("messages", message.id);
          if (!existing || existing.status !== "synced") {
            await db.put("messages", { ...message, status: "synced", lastError: null });
            result.downloaded++; changed = true;
          }
        }
        result.pulled = true;
      } catch { result.failed++; /* Local acknowledgments remain valid even if pulling history fails. */ }
    }
    if (changed) notify();
    return result;
  };
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  flight = (locks ? locks.request("crisismap-field-sync", run) : run()).finally(() => { flight = null; });
  return flight;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
const ReportPacketSchema = z.object({
  idempotencyKey: z.uuid(), formDataSerialized: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(), photo: z.string().max(MAX_PACKET_BYTES), photoType: z.string().max(100),
});
const PacketSchema = z.object({ format: z.literal("crisismap-field-packet"), version: z.literal(1),
  messages: z.array(MessageSchema).max(10000), reports: z.array(ReportPacketSchema).max(500),
});
export async function exportFieldPacket(): Promise<string> {
  const reports = [];
  let photoBytes = 0;
  for (const report of await listAll()) {
    if (report.status === "draft" || report.status === "synced") continue;
    const photo = await getPhotoBlob(report.photoBlobKey);
    if (!photo) throw new Error("A report photo is missing; keep this device's original data.");
    photoBytes += photo.size;
    if (photoBytes > MAX_PACKET_BYTES * 0.7) throw new Error("Recovery packet exceeds 25 MiB.");
    reports.push({ idempotencyKey: report.idempotencyKey, formDataSerialized: report.formDataSerialized, createdAt: report.createdAt, photo: toBase64(await photo.arrayBuffer()), photoType: photo.type });
  }
  const json = JSON.stringify({ format: "crisismap-field-packet", version: 1, messages: (await listFieldMessages()).map((m) => MessageSchema.parse(m)), reports });
  PacketSchema.parse(JSON.parse(json));
  if (new Blob([json]).size > MAX_PACKET_BYTES) throw new Error("Recovery packet exceeds 25 MiB.");
  return json;
}
async function importPacket(json: string): Promise<number> {
  if (new Blob([json]).size > MAX_PACKET_BYTES) throw new Error("Recovery packet exceeds 25 MiB.");
  const packet = PacketSchema.parse(JSON.parse(json));
  // Decode every photo before writing any records, so malformed files cannot partially import.
  const photos = packet.reports.map((r) => new Blob([Uint8Array.from(atob(r.photo), (c) => c.charCodeAt(0))], { type: r.photoType }));
  const db = await getDB();
  let count = 0;
  const tx = db.transaction("messages", "readwrite");
  for (const message of packet.messages) {
    if (!await tx.store.get(message.id)) { await tx.store.add({ ...message, status: "queued", retryCount: 0 }); count++; }
  }
  await tx.done;
  const known = new Set((await listAll()).map((r) => r.idempotencyKey));
  for (const [index, report] of packet.reports.entries()) {
    if (known.has(report.idempotencyKey)) continue;
    const id = await enqueueReport(report.formDataSerialized, photos[index], report.idempotencyKey);
    await patchReport(id, { createdAt: report.createdAt });
    known.add(report.idempotencyKey);
    count++;
  }
  notify();
  return count;
}
let importFlight: Promise<number> = Promise.resolve(0);
export function importFieldPacket(json: string): Promise<number> {
  const run = () => typeof navigator !== "undefined" && navigator.locks?.request
    ? navigator.locks.request("crisismap-packet-import", () => importPacket(json)) : importPacket(json);
  const result = importFlight.then(run, run);
  importFlight = result.catch(() => 0);
  return result;
}
