import { openDB } from "idb";

// Only public crisis metadata/schema is cached here. Session and analyst responses stay private.
export function canCacheSnapshot(path: string): boolean {
  if (/^\/crises\/modular-fields(?:[/?]|$)/.test(path)) return false;
  return /^\/crises(?:\?|$|\/[^/]+(?:\?|$|\/modular-schema(?:\?|$)))/.test(path);
}
async function database() {
  return openDB("crisismap-reference-cache", 1, {
    upgrade(db) { db.createObjectStore("snapshots", { keyPath: "path" }); },
  });
}
export async function readSnapshot(path: string): Promise<unknown | undefined> {
  try {
    const db = await database();
    try { return (await db.get("snapshots", path))?.data; } finally { db.close(); }
  } catch { return undefined; }
}
export async function saveSnapshot(path: string, data: unknown): Promise<void> {
  try {
    const db = await database();
    try {
      const tx = db.transaction("snapshots", "readwrite");
      await tx.store.put({ path, data, savedAt: Date.now() });
      const records = await tx.store.getAll();
      for (const entry of records.sort((a, b) => b.savedAt - a.savedAt).slice(100)) await tx.store.delete(entry.path);
      await tx.done;
    } finally { db.close(); }
  } catch { /* Cache quota/storage failure must not fail a successful API request. */ }
}
