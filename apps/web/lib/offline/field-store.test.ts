// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { Blob as NodeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listFieldMessages, queueFieldMessage, syncFieldMessages, exportFieldPacket, importFieldPacket } from "./field-store";
import { setApiReachable, setModePreference } from "./mode";
import { getPhotoBlob, listAll } from "./queue";

describe("durable field communications", () => {
  beforeEach(() => {
    setApiReachable(true);
    setModePreference("online");
    vi.restoreAllMocks();
  });
  afterEach(() => vi.unstubAllGlobals());
  it("validates before saving, persists content and keeps it queued while offline", async () => {
    await expect(queueFieldMessage(" ", "TEXT")).rejects.toThrow();
    const id = await queueFieldMessage("  Need supplies  ", "TEXT");
    setModePreference("offline");
    const fetcher = vi.fn();
    await syncFieldMessages(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await listFieldMessages()).find((m) => m.id === id)).toMatchObject({ content: "Need supplies", status: "queued" });
  });
  it("requires an actual matching server acknowledgment before marking uploaded", async () => {
    const id = await queueFieldMessage("Field observation", "TEXT");
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") return new Response(JSON.stringify({ success: true, data: [] }));
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ success: true, data: { ...body, receivedAt: new Date().toISOString() } }), { status: 201 });
    });
    await syncFieldMessages(fetcher);
    expect((await listFieldMessages()).find((m) => m.id === id)?.status).toBe("synced");
    await syncFieldMessages(fetcher);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST" && JSON.parse(String(init.body)).id === id)).toHaveLength(1);
  });
  it("keeps mismatched acknowledgments queued and retries with the original UUID", async () => {
    const id = await queueFieldMessage("Do not invent delivery", "TEXT");
    const sent: string[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") return new Response(JSON.stringify({ success: true, data: [] }));
      const body = JSON.parse(String(init?.body));
      sent.push(body.id);
      return new Response(JSON.stringify({ success: true, data: { ...body, id: crypto.randomUUID(), receivedAt: new Date().toISOString() } }), { status: 201 });
    });
    await syncFieldMessages(fetcher, true);
    expect((await listFieldMessages()).find((m) => m.id === id)?.status).toBe("queued");
    await syncFieldMessages(fetcher, true);
    expect(sent.filter((value) => value === id)).toHaveLength(2);
  });
  it("roundtrips packets without duplicate IDs and validates the whole packet before importing", async () => {
    await queueFieldMessage("Recovery record", "SOS", { latitude: 0, longitude: 0 });
    const packet = await exportFieldPacket();
    expect(await importFieldPacket(packet)).toBe(0);
    const before = (await listFieldMessages()).length;
    await expect(importFieldPacket(JSON.stringify({ version: 1, messages: [{ content: "invalid" }] }))).rejects.toThrow();
    expect((await listFieldMessages()).length).toBe(before);
  });
  it("imports report photos atomically and deduplicates concurrent recovery imports", async () => {
    vi.stubGlobal("Blob", NodeBlob);
    const key = crypto.randomUUID();
    const packet = JSON.stringify({ format: "crisismap-field-packet", version: 1, messages: [], reports: [{
      idempotencyKey: key, formDataSerialized: { infraName: "Recovery test" }, createdAt: new Date().toISOString(),
      photo: btoa("photo bytes"), photoType: "image/jpeg",
    }] });
    expect((await Promise.all([importFieldPacket(packet), importFieldPacket(packet)])).sort()).toEqual([0, 1]);
    const reports = (await listAll()).filter((r) => r.idempotencyKey === key);
    expect(reports).toHaveLength(1);
    expect(reports[0]).not.toHaveProperty("photo");
    expect((await getPhotoBlob(reports[0].photoBlobKey))?.size).toBe(11);
  });
});
