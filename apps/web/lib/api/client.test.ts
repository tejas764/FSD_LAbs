/**
 * Tests for the typed API client.
 * Environment: node (default vitest project setting)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const featureCollection = {
  type: "FeatureCollection",
  features: [],
  meta: { limit: 100, total: 0, nextCursor: null },
};

const submitResponse = {
  success: true,
  data: {
    id: "uuid-1",
    photoUrl: "https://cdn.example.com/photo.webp",
    acknowledgment: "Thank you",
    isDuplicate: false,
    version: 1,
  },
};

const exportQueued = { jobId: "42" };

const exportStatus = {
  jobId: "42",
  status: "completed",
  url: "https://storage.example.com/file.csv",
  expiresAt: "2025-01-01T00:00:00Z",
};

const crisesList = [
  {
    id: "crisis-1",
    name: "Syria Earthquake",
    type: "EARTHQUAKE",
    country: "SY",
    region: null,
    startedAt: "2024-02-06T01:17:00Z",
    isActive: true,
    extentBBox: [36.0, 36.0, 37.0, 37.0],
    createdAt: "2024-02-06T01:17:00Z",
    updatedAt: "2024-02-06T01:17:00Z",
  },
];

const footprintCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "fp-1",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [36.0, 36.0],
            [36.1, 36.0],
            [36.1, 36.1],
            [36.0, 36.0],
          ],
        ],
      },
      properties: { name: null },
    },
  ],
};

const modularSchemaResponse = {
  success: true,
  data: {
    crisisType: "EARTHQUAKE",
    infraType: "RESIDENTIAL",
    requiredCoreFields: ["description"],
    dynamicFields: {},
  },
};

describe("apiClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  describe("reports.list", () => {
    it("makes GET request to /api/v1/reports with crisisId query param", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(featureCollection),
      });

      const { apiClient } = await import("./client");
      await apiClient.reports.list({ crisisId: "crisis-1" });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/reports");
      expect(url).toContain("crisisId=crisis-1");
      expect(opts.credentials).toBe("include");
    });

    it("returns parsed FeatureCollection with features and meta", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(featureCollection),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.reports.list({ crisisId: "c1" });

      expect(result.type).toBe("FeatureCollection");
      expect(result.meta.limit).toBe(100);
      expect(result.meta.nextCursor).toBeNull();
    });

    it("throws ApiError on 4xx response", async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: () => Promise.resolve({ message: "Invalid params" }),
      });

      const { apiClient, ApiError } = await import("./client");
      await expect(
        apiClient.reports.list({ crisisId: "" }),
      ).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("reports.submit", () => {
    it("makes POST request with multipart form data and idempotency key header", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(submitResponse),
      });

      const { apiClient } = await import("./client");
      const formData = new FormData();
      formData.append("crisisId", "c1");
      await apiClient.reports.submit(formData, "idem-key-123");

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/reports");
      expect(opts.method).toBe("POST");
      expect(
        (opts.headers as Record<string, string>)["X-Idempotency-Key"],
      ).toBe("idem-key-123");
    });

    it("returns parsed SubmitReportData on success", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(submitResponse),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.reports.submit(new FormData(), "key");
      expect(result.id).toBe("uuid-1");
      expect(result.isDuplicate).toBe(false);
    });

    it("generates idempotency key when omitted", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(submitResponse),
      });

      vi.stubGlobal("crypto", {
        randomUUID: () => "generated-idem-key",
      } as Crypto);

      const { apiClient } = await import("./client");
      await apiClient.reports.submit(new FormData());

      const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(
        (opts.headers as Record<string, string>)["X-Idempotency-Key"],
      ).toBe("generated-idem-key");
    });
  });

  describe("reports.export", () => {
    it("makes POST to /api/v1/reports/export and returns jobId", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 202,
        json: () => Promise.resolve(exportQueued),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.reports.export({
        crisisId: "c1",
        format: "csv",
      });

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/reports/export");
      expect(opts.method).toBe("POST");
      expect(result.jobId).toBe("42");
    });
  });

  describe("reports.exportStatus", () => {
    it("makes GET to /api/v1/reports/export/:jobId", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(exportStatus),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.reports.exportStatus("42");

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("/api/v1/reports/export/42");
      expect(result.status).toBe("completed");
      expect(result.url).toBe("https://storage.example.com/file.csv");
    });
  });

  describe("crises.list", () => {
    it("makes GET to /api/v1/crises", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(crisesList),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.crises.list();

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("/api/v1/crises");
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Syria Earthquake");
    });

    it("adds active=true query param when active=true passed", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(crisesList),
      });

      const { apiClient } = await import("./client");
      await apiClient.crises.list(true);

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("active=true");
    });
  });

  describe("crises.footprints", () => {
    it("makes GET to /api/v1/crises/:id/footprints", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(footprintCollection),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.crises.footprints("crisis-1");

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("/api/v1/crises/crisis-1/footprints");
      expect(result.type).toBe("FeatureCollection");
    });
  });

  describe("crises.modularSchema", () => {
    it("makes POST to /api/v1/crises/:id/modular-schema with infraType", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(modularSchemaResponse),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.crises.modularSchema(
        "crisis-1",
        "RESIDENTIAL",
      );

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/crises/crisis-1/modular-schema");
      expect(opts.method).toBe("POST");
      expect(JSON.parse(opts.body as string)).toEqual({
        infraType: "RESIDENTIAL",
      });
      expect(result.infraType).toBe("RESIDENTIAL");
    });
  });

  describe("reports.moderate", () => {
    it("patches moderation status for a report", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              id: "r1",
              moderationStatus: "APPROVED",
              moderationNote: null,
              moderatedAt: "2025-01-01T00:00:00Z",
              moderatedBy: "analyst-1",
            },
          }),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.reports.moderate("r1", {
        moderationStatus: "APPROVED",
      });

      const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("/api/v1/reports/r1");
      expect(opts.method).toBe("PATCH");
      expect(result.data.moderationStatus).toBe("APPROVED");
    });
  });

  describe("reports.stream", () => {
    it("creates EventSource with credentials", async () => {
      const eventSourceSpy = vi.fn();
      vi.stubGlobal("EventSource", eventSourceSpy);

      const { apiClient } = await import("./client");
      apiClient.reports.stream("crisis-1");

      expect(eventSourceSpy).toHaveBeenCalledOnce();
      const [url, opts] = eventSourceSpy.mock.calls[0] as [
        string,
        { withCredentials: boolean },
      ];
      expect(url).toContain("/api/v1/reports/stream");
      expect(url).toContain("crisisId=crisis-1");
      expect(opts.withCredentials).toBe(true);
    });
  });

  describe("reporter.profile", () => {
    it("gets reporter profile by reporterId query param", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              reporterId: "anon-1",
              reportCount: 4,
              badgeLevel: "bronze",
              lastActiveAt: "2025-01-01T00:00:00Z",
            },
          }),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.reporter.profile("anon-1");

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("/api/v1/reporter/profile");
      expect(url).toContain("reporterId=anon-1");
      expect(result.data.reportCount).toBe(4);
    });
  });

  describe("analytics.summary", () => {
    it("accepts legacy summary response without recentReports", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              totalReports: 12,
              reportsByDay: [{ date: "2026-04-20", count: 12 }],
              byDamageLevel: { MINIMAL: 3, PARTIAL: 5, COMPLETE: 4 },
              byInfraType: [{ type: "ROAD", count: 12 }],
              pendingModeration: 2,
            },
          }),
      });

      const { apiClient } = await import("./client");
      const result = await apiClient.analytics.summary("c1", "7d");

      expect(result.success).toBe(true);
      expect(result.data.recentReports).toEqual([]);
    });

    it("sends custom date range query params when provided", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              totalReports: 12,
              reportsByDay: [{ date: "2026-04-20", count: 12 }],
              byDamageLevel: { MINIMAL: 3, PARTIAL: 5, COMPLETE: 4 },
              byInfraType: [{ type: "ROAD", count: 12 }],
              pendingModeration: 2,
              recentReports: [],
            },
          }),
      });

      const { apiClient } = await import("./client");
      await apiClient.analytics.summary({
        crisisId: "c1",
        dateFrom: "2026-03-01",
        dateTo: "2026-03-31",
      });

      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toContain("/api/v1/analytics/summary");
      expect(url).toContain("crisisId=c1");
      expect(url).toContain("dateFrom=2026-03-01");
      expect(url).toContain("dateTo=2026-03-31");
      expect(url).not.toContain("period=");
    });
  });

  describe("crises.modularFields", () => {
    it("creates and lists modular fields", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: () =>
            Promise.resolve({
              success: true,
              data: {
                id: "mf-1",
                crisisId: "c1",
                infraType: "RESIDENTIAL",
                fieldKey: "roof_type",
                fieldType: "string",
                required: true,
                labels: { en: "Roof type" },
                createdAt: "2025-01-01T00:00:00Z",
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                {
                  id: "mf-1",
                  crisisId: "c1",
                  infraType: "RESIDENTIAL",
                  fieldKey: "roof_type",
                  fieldType: "string",
                  required: true,
                  labels: { en: "Roof type" },
                  createdAt: "2025-01-01T00:00:00Z",
                },
              ],
            }),
        });

      const { apiClient } = await import("./client");
      await apiClient.crises.createModularField({
        crisisId: "c1",
        infraType: "RESIDENTIAL",
        fieldKey: "roof_type",
      });
      const listed = await apiClient.crises.listModularFields("c1");

      expect(listed.data).toHaveLength(1);
      expect(listed.data[0].fieldKey).toBe("roof_type");
    });
  });
});
