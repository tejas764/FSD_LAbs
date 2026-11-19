import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mode = vi.hoisted(() => ({ offline: false }));
vi.mock("@/lib/offline/mode", () => ({ isOfflineMode: () => mode.offline }));
import { volunteerApi, VolunteerApiError } from "./volunteer-api";

describe("volunteer API requests", () => {
  beforeEach(() => {
    mode.offline = false;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("enrolls with the strict profile payload and includes the authenticated session", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { id: "v1" } }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    await volunteerApi.enroll({
      name: "Account Name",
      phone: "+919000000000",
      location: "Pune",
      skills: ["Logistics"],
      bio: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
    });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("/api/v1/volunteers/enroll");
    expect(options.credentials).toBe("include");
    expect(options.cache).toBe("no-store");
    expect(JSON.parse(options.body)).toEqual({
      phone: "+919000000000",
      location: "Pune",
      skills: ["Logistics"],
      bio: "",
      emergencyContactName: "",
      emergencyContactPhone: "",
    });
  });

  it("never sends personal records or mutations when manual offline mode is selected", async () => {
    mode.offline = true;
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(volunteerApi.availability("AVAILABLE")).rejects.toThrow(
      "require online mode",
    );
    await expect(volunteerApi.dashboard()).rejects.toThrow(
      "require online mode",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces server authorization and transition errors instead of reporting success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              success: false,
              error: { message: "This assignment does not belong to you" },
            }),
            { status: 403 },
          ),
        ),
    );
    await expect(
      volunteerApi.progress("other-assignment", 50, "Update"),
    ).rejects.toMatchObject({
      status: 403,
      message: "This assignment does not belong to you",
    });
  });

  it("does not trust a malformed dashboard response", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              success: true,
              data: { stats: { verifiedHours: 500 } },
            }),
            { status: 200 },
          ),
        ),
    );
    await expect(volunteerApi.dashboard()).rejects.toBeInstanceOf(
      VolunteerApiError,
    );
  });
});
