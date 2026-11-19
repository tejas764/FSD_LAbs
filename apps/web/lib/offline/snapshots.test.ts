// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import { canCacheSnapshot } from "./snapshots";
import { setApiReachable, setModePreference } from "./mode";

afterEach(() => { setApiReachable(true); setModePreference("online"); vi.unstubAllGlobals(); });
describe("offline reference data", () => {
  it("reuses validated crisis metadata without issuing network requests in manual offline mode", async () => {
    setModePreference("online");
    const crisis = { id: "cached-crisis", name: "Saved crisis", type: "FLOOD", country: "IN", region: null,
      startedAt: "2026-11-18T00:00:00Z", isActive: true, extentBBox: null,
      createdAt: "2026-11-18T00:00:00Z", updatedAt: "2026-11-18T00:00:00Z" };
    const fetcher = vi.fn(async () => new Response(JSON.stringify([crisis])));
    vi.stubGlobal("fetch", fetcher);
    expect((await apiClient.crises.list(true))[0].name).toBe("Saved crisis");
    setModePreference("offline");
    expect((await apiClient.crises.list(true, { q: "Saved", take: 50 }))[0].name).toBe("Saved crisis");
    expect((await apiClient.crises.list(true))[0].name).toBe("Saved crisis");
    await expect(apiClient.reports.submit(new FormData())).rejects.toMatchObject({ code: "OFFLINE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("keeps a prepared form schema available through transport failures before the health probe", async () => {
    setModePreference("online");
    const data = { crisisType: "FLOOD", infraType: "RESIDENTIAL", requiredCoreFields: [], dynamicFields: {} };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data })))
      .mockRejectedValueOnce(new TypeError("Connection dropped"));
    vi.stubGlobal("fetch", fetcher);
    expect(await apiClient.crises.modularSchema("prepared", "RESIDENTIAL")).toEqual(data);
    expect(await apiClient.crises.modularSchema("prepared", "RESIDENTIAL")).toEqual(data);
    setModePreference("offline");
    expect(await apiClient.crises.modularSchema("prepared", "RESIDENTIAL")).toEqual(data);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("never persists authentication, analyst or report detail responses", () => {
    for (const path of ["/auth/get-session", "/reports", "/reports/secret-id", "/analytics/summary", "/account", "/crises/admin/export", "/crises/modular-fields?crisisId=x"]) expect(canCacheSnapshot(path)).toBe(false);
    expect(canCacheSnapshot("/crises?active=true")).toBe(true);
    expect(canCacheSnapshot("/crises/crisis-id/modular-schema?infraType=HEALTH")).toBe(true);
  });
});
