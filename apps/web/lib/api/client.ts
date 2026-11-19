/**
 * Typed API client for CrisisMap backend.
 * All requests include credentials for session cookie auth.
 * Responses are validated with Zod schemas.
 */
import { z } from "zod";
import { isOfflineMode } from "@/lib/offline/mode";
import { canCacheSnapshot, readSnapshot, saveSnapshot } from "@/lib/offline/snapshots";

// Use relative URL so browser requests go same-origin through Next.js
// rewrites (/api/v1/* → internal API server). This avoids CORS and
// ensures session cookies are sent automatically.
const API_BASE = "";

// ─────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiFailure {
  success: false;
  error: string;
}

// ─────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────

const DamageLevelSchema = z.enum(["MINIMAL", "PARTIAL", "COMPLETE"] as const);
const InfraTypeSchema = z.enum([
  "RESIDENTIAL",
  "COMMERCIAL",
  "GOVERNMENT",
  "UTILITY",
  "TRANSPORT_COMMUNICATION",
  "COMMUNITY",
  "PUBLIC_RECREATION",
  "OTHER",
] as const);
const CrisisTypeSchema = z.enum([
  "EARTHQUAKE",
  "FLOOD",
  "TSUNAMI",
  "HURRICANE_CYCLONE",
  "WILDFIRE",
  "EXPLOSION",
  "CHEMICAL_INCIDENT",
  "CONFLICT",
  "CIVIL_UNREST",
] as const);

export type DamageLevel = z.infer<typeof DamageLevelSchema>;
export type InfraType = z.infer<typeof InfraTypeSchema>;
export type CrisisType = z.infer<typeof CrisisTypeSchema>;

// Report GeoJSON
const ReportGeoJsonPointGeometrySchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

const ReportGeoJsonPropertiesSchema = z.object({
  crisisId: z.string(),
  damageLevel: DamageLevelSchema,
  submittedAt: z.string(),
  isDuplicate: z.boolean(),
  version: z.number(),
  moderationStatus: z
    .enum(["PENDING", "FLAGGED", "UNDER_REVIEW", "APPROVED", "REJECTED"] as const)
    .nullable()
    .optional(),
  infraType: z.string().optional(),
  infraName: z.string().nullable().optional(),
  crisisType: CrisisTypeSchema,
  locationText: z.string().nullable().optional(),
});

const ReportGeoJsonFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string(),
  geometry: ReportGeoJsonPointGeometrySchema.nullable(),
  properties: ReportGeoJsonPropertiesSchema,
});

const ReportGeoJsonMetaSchema = z.object({
  limit: z.number(),
  total: z.number(),
  nextCursor: z.string().nullable(),
});

const ReportGeoJsonFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(ReportGeoJsonFeatureSchema),
  meta: ReportGeoJsonMetaSchema,
});

export type ReportGeoJsonFeatureCollection = z.infer<
  typeof ReportGeoJsonFeatureCollectionSchema
>;

// Submit report
const SubmitReportDataSchema = z.object({
  id: z.string(),
  photoUrl: z.string(),
  acknowledgment: z.string(),
  isDuplicate: z.boolean(),
  version: z.number(),
});

const SubmitReportResponseSchema = z.object({
  success: z.boolean(),
  data: SubmitReportDataSchema,
});

export type SubmitReportData = z.infer<typeof SubmitReportDataSchema>;

// Export job
const ExportJobQueuedSchema = z.object({
  jobId: z.string(),
});

const ExportJobStatusSchema = z.object({
  jobId: z.string(),
  status: z.enum(["queued", "processing", "completed", "failed"] as const),
  url: z.string().optional(),
  expiresAt: z.string().optional(),
});

export type ExportJobQueued = z.infer<typeof ExportJobQueuedSchema>;
export type ExportJobStatus = z.infer<typeof ExportJobStatusSchema>;

// Audit
const ModerationAuditEntrySchema = z.object({
  id: z.string(),
  reportId: z.string(),
  action: z.string(),
  actorId: z.string(),
  previousValue: z.record(z.string(), z.unknown()),
  newValue: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

const ModerationAuditPaginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  totalItems: z.number(),
  totalPages: z.number(),
});

const ModerationAuditResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(ModerationAuditEntrySchema),
    pagination: ModerationAuditPaginationSchema,
  }),
});

export type ModerationAuditResponse = z.infer<typeof ModerationAuditResponseSchema>;

// Crisis
const CrisisSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: CrisisTypeSchema,
  country: z.string(),
  region: z.string().nullable().optional(),
  startedAt: z.string(),
  endedAt: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean(),
  extentBBox: z.array(z.number()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Crisis = z.infer<typeof CrisisSchema>;

const CrisisMutationResponseSchema = z.object({
  success: z.boolean(),
  data: CrisisSchema,
});

export type CrisisMutationResponse = z.infer<typeof CrisisMutationResponseSchema>;

// Footprints
const CrisisFootprintGeometrySchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"] as const),
  coordinates: z.array(z.array(z.array(z.number()))),
});

const CrisisFootprintFeatureSchema = z.object({
  type: z.literal("Feature"),
  id: z.string(),
  geometry: CrisisFootprintGeometrySchema.nullable(),
  properties: z.object({ name: z.string().nullable() }),
});

const CrisisFootprintFeatureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(CrisisFootprintFeatureSchema),
});

export type CrisisFootprintFeatureCollection = z.infer<
  typeof CrisisFootprintFeatureCollectionSchema
>;

const ModularFieldSchema = z.object({
  id: z.string(),
  crisisId: z.string(),
  infraType: InfraTypeSchema,
  fieldKey: z.string(),
  fieldType: z.enum(["string", "number", "boolean"] as const),
  required: z.boolean(),
  labels: z.record(z.string(), z.string()).nullable(),
  createdAt: z.string(),
});

const ModularFieldMutationResponseSchema = z.object({
  success: z.boolean(),
  data: ModularFieldSchema,
});

const AccountChangePasswordResponseSchema = z.object({
  success: z.literal(true),
});

const ModularFieldListResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(ModularFieldSchema),
});

export type ModularField = z.infer<typeof ModularFieldSchema>;

// Modular schema
const DynamicFieldSchema = z.object({
  key: z.string(),
  type: z.enum(["string", "number", "boolean"] as const),
  required: z.boolean(),
  labels: z.record(z.string(), z.string()),
  placeholders: z.record(z.string(), z.string()),
});

const ModularSchemaDataSchema = z.object({
  crisisType: CrisisTypeSchema,
  infraType: InfraTypeSchema,
  requiredCoreFields: z.array(z.string()),
  dynamicFields: z.record(z.string(), DynamicFieldSchema),
});

const ModularSchemaResponseSchema = z.object({
  success: z.boolean(),
  data: ModularSchemaDataSchema,
});

export type ModularSchemaData = z.infer<typeof ModularSchemaDataSchema>;

const ReporterProfileResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    reporterId: z.string(),
    reportCount: z.number(),
    badgeLevel: z.string(),
    lastActiveAt: z.string(),
  }),
});

export type ReporterProfileResponse = z.infer<typeof ReporterProfileResponseSchema>;

const HotspotSchema = z.object({
  h3Index: z.string(),
  centerLat: z.number(),
  centerLng: z.number(),
  count: z.number(),
  avgDamageLevel: z.number(),
});

const HotspotResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(HotspotSchema),
});

export type HotspotResponse = z.infer<typeof HotspotResponseSchema>;

export const SUMMARY_PERIODS = ["7d", "30d", "90d", "365d", "all"] as const;
export type SummaryPeriod = (typeof SUMMARY_PERIODS)[number];

export type SummaryQuery = {
  crisisId?: string | null;
  period?: SummaryPeriod;
  dateFrom?: string;
  dateTo?: string;
};

const SummaryDataSchema = z.object({
  totalReports: z.number(),
  reportsByDay: z.array(z.object({ date: z.string(), count: z.number() })),
  byDamageLevel: z.object({
    MINIMAL: z.number(),
    PARTIAL: z.number(),
    COMPLETE: z.number(),
  }),
  byInfraType: z.array(z.object({ type: z.string(), count: z.number() })),
  pendingModeration: z.number(),
  recentReports: z.array(z.object({
    id: z.string(),
    submittedAt: z.string(),
    damageLevel: z.string(),
    infraType: z.string(),
    locationText: z.string().nullable(),
  })).optional().default([]),
});

const SummaryResponseSchema = z.object({
  success: z.boolean(),
  data: SummaryDataSchema,
});

export type SummaryData = z.infer<typeof SummaryDataSchema>;
export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

const ReportDetailResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string(),
    crisisId: z.string(),
    damageLevel: DamageLevelSchema,
    infraType: InfraTypeSchema,
    crisisType: CrisisTypeSchema,
    hasDebris: z.boolean(),
    electricityCondition: z.string(),
    healthServicesFunctioning: z.string(),
    pressingNeeds: z.array(z.string()),
    submittedAt: z.string(),
    isDuplicate: z.boolean(),
    version: z.number(),
    extraFields: z.record(z.string(), z.unknown()),
    infraName: z.string().nullable().optional(),
    collectedAt: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    pressingNeedsOther: z.string().nullable().optional(),
    descriptionLang: z.string().nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    locationText: z.string().nullable().optional(),
    buildingId: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
    supersededById: z.string().nullable().optional(),
  }),
});

const ReportHistoryResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(
    z.object({
      id: z.string(),
      version: z.number(),
      damageLevel: DamageLevelSchema,
      submittedAt: z.string(),
      isCurrent: z.boolean(),
    }),
  ),
});

const ReportModerationResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string(),
    moderationStatus: z.enum([
      "PENDING",
      "FLAGGED",
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
    ] as const),
    moderationNote: z.string().nullable().optional(),
    moderatedAt: z.string(),
    moderatedBy: z.string(),
  }),
});

const ReportAnonymizeResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    id: z.string(),
    anonymizedAt: z.string(),
  }),
});

export type ReportDetailResponse = z.infer<typeof ReportDetailResponseSchema>;
export type ReportHistoryResponse = z.infer<typeof ReportHistoryResponseSchema>;
export type ReportModerationResponse = z.infer<typeof ReportModerationResponseSchema>;
export type ReportAnonymizeResponse = z.infer<typeof ReportAnonymizeResponseSchema>;

// ─────────────────────────────────────────────
// Request types
// ─────────────────────────────────────────────

export interface ReportListFilters {
  crisisId?: string;
  cursor?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  damageLevel?: DamageLevel;
  moderationStatus?:
    | "PENDING"
    | "FLAGGED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED";
  bounds?: string;
}

export interface CreateExportRequest {
  crisisId?: string;
  format: "csv" | "geojson" | "shapefile";
  dateFrom?: string;
  dateTo?: string;
  bounds?: string;
}

export interface ModerateReportBody {
  moderationStatus:
    | "PENDING"
    | "FLAGGED"
    | "UNDER_REVIEW"
    | "APPROVED"
    | "REJECTED";
  moderationNote?: string;
}

export interface CreateModularFieldBody {
  crisisId: string;
  infraType: InfraType;
  fieldKey: string;
  fieldType?: "string" | "number" | "boolean";
  required?: boolean;
  labels?: Record<string, string>;
}

export interface CreateCrisisBody {
  name: string;
  type: CrisisType;
  country: string;
  startedAt: string;
  endedAt?: string;
  description?: string;
  region?: string;
  extentBBox?: [number, number, number, number];
}

export interface UpdateCrisisBody {
  name?: string;
  isActive?: boolean;
  region?: string;
  startedAt?: string;
  endedAt?: string;
  description?: string;
  extentBBox?: [number, number, number, number];
}

// ─────────────────────────────────────────────
// Core fetch wrapper
// ─────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const url = `${API_BASE}/api/v1${path}`;
  const cacheable = (options.method ?? "GET") === "GET" && canCacheSnapshot(path);
  const cached = async (): Promise<T | undefined> => {
    if (!cacheable) return undefined;
    const parsed = schema.safeParse(await readSnapshot(path));
    return parsed.success ? parsed.data : undefined;
  };
  if (isOfflineMode()) {
    const data = await cached();
    if (data !== undefined) return data;
    throw new ApiError(0, "Offline: this data has not been saved on this device", "OFFLINE");
  }
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(15000),
      credentials: "include",
    });
  } catch (error) {
    const data = await cached();
    if (data !== undefined) return data;
    throw error;
  }

  if (!response.ok) {
    let message = response.statusText;
    let code: string | undefined;
    try {
      const body = (await response.json()) as {
        success?: unknown;
        errors?: unknown;
        message?: unknown;
        error?: unknown;
        code?: unknown;
      };
      // Handle nested error object: { error: { code, message } }
      if (body.error !== null && typeof body.error === "object") {
        const e = body.error as Record<string, unknown>;
        if (typeof e.message === "string") message = e.message;
        if (typeof e.code === "string") code = e.code;
      } else if (typeof body.error === "string") {
        message = body.error;
        if (typeof body.code === "string") code = body.code;
      } else if (typeof body.message === "string") {
        message = body.message;
        if (typeof body.code === "string") code = body.code;
      } else if (Array.isArray(body.errors) && body.errors.length > 0) {
        message = String(body.errors[0]);
      }
    } catch {
      // ignore parse failure
    }
    if (response.status >= 500) {
      const data = await cached();
      if (data !== undefined) return data;
    }
    throw new ApiError(response.status, message, code);
  }

  const json = await response.json();
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new ApiError(0, "Response shape mismatch");
  }
  if (cacheable) await saveSnapshot(path, result.data);
  return result.data;
}

async function apiFetchNoContent(path: string, options: RequestInit): Promise<void> {
  if (isOfflineMode()) throw new ApiError(0, "This action requires online mode", "OFFLINE");
  const url = `${API_BASE}/api/v1${path}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = (await response.json()) as { message?: unknown; error?: unknown };
      if (typeof body.error === "string") message = body.error;
      else if (typeof body.message === "string") message = body.message;
    } catch {
      // ignore parse failure
    }
    throw new ApiError(response.status, message);
  }
}

function buildQuery(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return "";
  return (
    "?" +
    entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")
  );
}

// ─────────────────────────────────────────────
// API client
// ─────────────────────────────────────────────

export const apiClient = {
  reports: {
    async list(
      filters: ReportListFilters = {},
    ): Promise<ReportGeoJsonFeatureCollection> {
      const qs = buildQuery({
        crisisId: filters.crisisId,
        cursor: filters.cursor,
        limit: filters.limit,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        damageLevel: filters.damageLevel,
        moderationStatus: filters.moderationStatus,
        bounds: filters.bounds,
      });
      return apiFetch(
        `/reports${qs}`,
        { method: "GET" },
        ReportGeoJsonFeatureCollectionSchema,
      );
    },

    async submit(
      formData: FormData,
      idempotencyKey: string = crypto.randomUUID(),
    ): Promise<SubmitReportData> {
      const result = await apiFetch(
        "/reports",
        {
          method: "POST",
          body: formData,
          headers: { "X-Idempotency-Key": idempotencyKey },
        },
        SubmitReportResponseSchema,
      );
      return result.data;
    },

    async getById(id: string): Promise<ReportDetailResponse> {
      return apiFetch(
        `/reports/${encodeURIComponent(id)}`,
        { method: "GET" },
        ReportDetailResponseSchema,
      );
    },

    async getHistory(id: string): Promise<ReportHistoryResponse> {
      return apiFetch(
        `/reports/${encodeURIComponent(id)}/history`,
        { method: "GET" },
        ReportHistoryResponseSchema,
      );
    },

    async export(req: CreateExportRequest): Promise<ExportJobQueued> {
      return apiFetch(
        "/reports/export",
        {
          method: "POST",
          body: JSON.stringify(req),
          headers: { "Content-Type": "application/json" },
        },
        ExportJobQueuedSchema,
      );
    },

    async exportStatus(jobId: string): Promise<ExportJobStatus> {
      return apiFetch(
        `/reports/export/${encodeURIComponent(jobId)}`,
        { method: "GET" },
        ExportJobStatusSchema,
      );
    },

    stream(crisisId: string): EventSource {
      const qs = buildQuery({ crisisId });
      return new EventSource(`${API_BASE}/api/v1/reports/stream${qs}`, {
        withCredentials: true,
      });
    },

    publicStream(crisisId: string): EventSource {
      const qs = buildQuery({ crisisId });
      return new EventSource(`${API_BASE}/api/v1/reports/stream/public${qs}`);
    },

    async moderate(id: string, body: ModerateReportBody): Promise<ReportModerationResponse> {
      return apiFetch(
        `/reports/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        },
        ReportModerationResponseSchema,
      );
    },

    async delete(id: string): Promise<void> {
      return apiFetchNoContent(`/reports/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },

    async anonymize(id: string): Promise<ReportAnonymizeResponse> {
      return apiFetch(
        `/reports/${encodeURIComponent(id)}/anonymize`,
        { method: "POST" },
        ReportAnonymizeResponseSchema,
      );
    },

    async audit(
      id: string,
      page?: number,
      pageSize?: number,
    ): Promise<ModerationAuditResponse> {
      const qs = buildQuery({
        page: page !== undefined ? String(page) : undefined,
        pageSize: pageSize !== undefined ? String(pageSize) : undefined,
      });
      return apiFetch(
        `/reports/${encodeURIComponent(id)}/audit${qs}`,
        { method: "GET" },
        ModerationAuditResponseSchema,
      );
    },
  },

  reporter: {
    async profile(reporterId: string): Promise<ReporterProfileResponse> {
      const qs = buildQuery({ reporterId });
      return apiFetch(
        `/reporter/profile${qs}`,
        { method: "GET" },
        ReporterProfileResponseSchema,
      );
    },
  },

  account: {
    async changePassword(currentPassword: string, newPassword: string): Promise<void> {
      await apiFetch(
        "/account/change-password",
        {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword }),
          headers: { "Content-Type": "application/json" },
        },
        AccountChangePasswordResponseSchema,
      );
    },
  },

  analytics: {
    async hotspots(crisisId?: string | null, damageLevel?: DamageLevel): Promise<HotspotResponse> {
      const qs = buildQuery({ ...(crisisId ? { crisisId } : {}), damageLevel });
      return apiFetch(
        `/analytics/hotspots${qs}`,
        { method: "GET" },
        HotspotResponseSchema,
      );
    },

    async summary(
      crisisIdOrQuery?: string | null | SummaryQuery,
      period: SummaryPeriod = "7d",
    ): Promise<SummaryResponse> {
      const query: SummaryQuery =
        typeof crisisIdOrQuery === "object" && crisisIdOrQuery !== null
          ? crisisIdOrQuery
          : {
            crisisId: crisisIdOrQuery,
            period,
          };

      const qs = buildQuery({
        ...(query.crisisId ? { crisisId: query.crisisId } : {}),
        ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}),
        ...(query.dateTo ? { dateTo: query.dateTo } : {}),
        ...(query.dateFrom || query.dateTo ? {} : { period: query.period ?? "7d" }),
      });
      return apiFetch(
        `/analytics/summary${qs}`,
        { method: "GET" },
        SummaryResponseSchema,
      );
    },
  },

  crises: {
    async list(
      active?: boolean,
      opts?: { q?: string; country?: string; take?: number; lat?: number; lng?: number },
    ): Promise<Crisis[]> {
      const qs = buildQuery({
        active,
        q: opts?.q,
        country: opts?.country,
        take: opts?.take,
        lat: opts?.lat,
        lng: opts?.lng,
      });
      try {
        return await apiFetch(`/crises${qs}`, { method: "GET" }, z.array(CrisisSchema));
      } catch (error) {
        if (!isOfflineMode() && !(error instanceof TypeError)) throw error;
        const snapshot = z.array(CrisisSchema).safeParse(await readSnapshot("/crises?active=true"));
        if (!snapshot.success) throw error;
        const query = opts?.q?.trim().toLocaleLowerCase();
        return snapshot.data.filter((crisis) =>
          (!opts?.country || crisis.country === opts.country) &&
          (!query || [crisis.name, crisis.country, crisis.region ?? ""].some((text) => text.toLocaleLowerCase().includes(query))),
        ).slice(0, opts?.take ?? snapshot.data.length);
      }
    },

    async getById(id: string): Promise<Crisis> {
      return apiFetch(
        `/crises/${encodeURIComponent(id)}`,
        { method: "GET" },
        CrisisSchema,
      );
    },

    async footprints(
      crisisId: string,
    ): Promise<CrisisFootprintFeatureCollection> {
      return apiFetch(
        `/crises/${encodeURIComponent(crisisId)}/footprints`,
        { method: "GET" },
        CrisisFootprintFeatureCollectionSchema,
      );
    },

    async modularSchema(
      crisisId: string,
      infraType: string,
    ): Promise<ModularSchemaData> {
      const cacheKey = `/crises/${encodeURIComponent(crisisId)}/modular-schema?infraType=${encodeURIComponent(infraType)}`;
      if (isOfflineMode()) {
        const cached = ModularSchemaResponseSchema.safeParse(await readSnapshot(cacheKey));
        if (cached.success) return cached.data.data;
        throw new ApiError(0, "This form has not been prepared on this device", "OFFLINE");
      }
      try {
        const result = await apiFetch(
          `/crises/${encodeURIComponent(crisisId)}/modular-schema`,
          {
            method: "POST",
            body: JSON.stringify({ infraType }),
            headers: { "Content-Type": "application/json" },
          },
          ModularSchemaResponseSchema,
        );
        await saveSnapshot(cacheKey, result);
        return result.data;
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) throw error;
        const cached = ModularSchemaResponseSchema.safeParse(await readSnapshot(cacheKey));
        if (cached.success) return cached.data.data;
        throw error;
      }
    },

    async create(body: CreateCrisisBody): Promise<CrisisMutationResponse> {
      return apiFetch(
        "/crises",
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        },
        CrisisMutationResponseSchema,
      );
    },

    async update(id: string, body: UpdateCrisisBody): Promise<CrisisMutationResponse> {
      return apiFetch(
        `/crises/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        },
        CrisisMutationResponseSchema,
      );
    },

    async createModularField(
      body: CreateModularFieldBody,
    ): Promise<{ success: boolean; data: ModularField }> {
      return apiFetch(
        "/crises/modular-fields",
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json" },
        },
        ModularFieldMutationResponseSchema,
      );
    },

    async listModularFields(
      crisisId: string,
    ): Promise<{ success: boolean; data: ModularField[] }> {
      const qs = buildQuery({ crisisId });
      return apiFetch(
        `/crises/modular-fields${qs}`,
        { method: "GET" },
        ModularFieldListResponseSchema,
      );
    },

    async deleteModularField(id: string): Promise<void> {
      return apiFetchNoContent(`/crises/modular-fields/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
    },
  },
};
