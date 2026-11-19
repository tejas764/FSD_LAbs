import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { ErrorCode } from "../src/common/error-codes";
import { PrismaService } from "../src/prisma/prisma.service";
import { AiClassificationWorker } from "../src/queue/ai-classification.worker";
import { DescriptionTranslationWorker } from "../src/queue/description-translation.worker";
import { Queue } from "bullmq";
import { sign } from "jsonwebtoken";
import {
  AI_CLASSIFICATION_ADAPTER_TOKEN,
  type AiClassificationAdapter,
} from "../src/queue/adapters/ai-classification.adapter";
import {
  DESCRIPTION_TRANSLATION_ADAPTER_TOKEN,
  type DescriptionTranslationAdapter,
} from "../src/queue/adapters/description-translation.adapter";
import { QueueService } from "../src/queue/queue.service";
import { ReportStorageService } from "../src/reports/report-storage.service";

jest.setTimeout(120000);

function validPayload(
  crisisId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    crisisId,
    damageLevel: "PARTIAL",
    infraType: "RESIDENTIAL",
    infraName: "School",
    crisisType: "EARTHQUAKE",
    hasDebris: "false",
    collectedAt: new Date().toISOString(),
    description: "Observed damage",
    electricityCondition: "SEVERE_DAMAGE",
    healthServicesFunctioning: "PARTIALLY_FUNCTIONAL",
    pressingNeeds: JSON.stringify(["FOOD_WATER"]),
    extraFields: {},
    latitude: "36.2021",
    longitude: "36.1601",
    ...overrides,
  };
}

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7sAAAAASUVORK5CYII=",
  "base64",
);

function attachMultipart(
  req: request.Test,
  crisisId: string,
  overrides: Record<string, unknown> = {},
  includePhoto = true,
) {
  const payload = validPayload(crisisId, overrides);

  Object.entries(payload).forEach(([key, value]) => {
    if (typeof value === "undefined") {
      return;
    }
    if (key === "extraFields") {
      req.field(key, JSON.stringify(value));
      return;
    }
    if (key === "pressingNeeds") {
      req.field(key, String(value));
      return;
    }
    req.field(key, String(value));
  });

  if (includePhoto) {
    req.attach("photo", onePixelPng, {
      filename: "photo.png",
      contentType: "image/png",
    });
  }

  return req;
}

describe("POST /api/v1/reports contract parity", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seededCrisisId: string;
  let aiQueue: Queue;
  let translationQueue: Queue;
  let aiWorker: AiClassificationWorker;
  let translationWorker: DescriptionTranslationWorker;
  let authJwtSecret: string;

  const testConfigValues: Record<string, string | number> = {
    DATABASE_URL: "postgresql://crisismap:crisismap@localhost:5432/crisismap",
    BETTER_AUTH_SECRET: "test-auth-jwt-secret",
    BETTER_AUTH_JWT_ISSUER: "crisismap-tests",
    BETTER_AUTH_JWT_AUDIENCE: "crisismap-admin",
    RATE_LIMIT_PER_HOUR: 10,
    RATE_LIMIT_ADMIN_EXPORT_PER_MINUTE: 2,
    REDIS_DB: 1,
    AI_CLASSIFICATION_ADAPTER: "mock",
  };

  beforeAll(async () => {
    authJwtSecret = String(testConfigValues.BETTER_AUTH_SECRET);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, defaultValue?: unknown) =>
          key in testConfigValues ? testConfigValues[key] : defaultValue,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    prisma = moduleRef.get(PrismaService);
    aiQueue = moduleRef.get<Queue>(getQueueToken("ai-classification"));
    translationQueue = moduleRef.get<Queue>(
      getQueueToken("description-translation"),
    );
    aiWorker = new AiClassificationWorker(
      prisma,
      moduleRef.get<AiClassificationAdapter>(AI_CLASSIFICATION_ADAPTER_TOKEN),
    );
    translationWorker = new DescriptionTranslationWorker(
      prisma,
      moduleRef.get<DescriptionTranslationAdapter>(
        DESCRIPTION_TRANSLATION_ADAPTER_TOKEN,
      ),
    );

    const crisis = await prisma.crisis.create({
      data: {
        name: "E2E Test Crisis",
        type: "EARTHQUAKE",
        country: "Syria",
        startedAt: new Date("2026-01-01"),
      },
    });
    seededCrisisId = crisis.id;
  });

  afterAll(async () => {
    await aiQueue.drain(true);
    await translationQueue.drain(true);

    const reportIds = await prisma.report.findMany({
      where: { crisisId: seededCrisisId },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: {
        reportId: {
          in: reportIds.map((report) => report.id),
        },
      },
    });

    await prisma.report.deleteMany({ where: { crisisId: seededCrisisId } });
    await prisma.crisis.delete({ where: { id: seededCrisisId } });
    await app.close();
  });

  it("returns 400 structured error when collectedAt is missing", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer()).post("/api/v1/reports"),
      seededCrisisId,
      { collectedAt: undefined },
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toContain("collectedAt");
  });

  it("returns 400 when description is missing", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer()).post("/api/v1/reports"),
      seededCrisisId,
      { description: "" },
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts submission when extraFields is omitted (now optional, defaults to {})", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer()).post("/api/v1/reports"),
      seededCrisisId,
      { extraFields: undefined },
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it("returns 400 when only latitude is provided without longitude/locationText", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer()).post("/api/v1/reports"),
      seededCrisisId,
      {
        longitude: undefined,
        locationText: "",
      },
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toContain("location");
  });

  it("returns 201 and persists the report to the database", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer()).post("/api/v1/reports"),
      seededCrisisId,
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBeDefined();
    expect(response.body.data.photoUrl).toBeDefined();
    expect(response.body.data.acknowledgment).toBeDefined();
    expect(typeof response.body.data.isDuplicate).toBe("boolean");
    expect(typeof response.body.data.version).toBe("number");

    // Verify the record actually exists in the database
    const saved = await prisma.report.findUnique({
      where: { id: response.body.data.id },
    });
    expect(saved).not.toBeNull();
    expect(saved!.crisisId).toBe(seededCrisisId);
    expect(saved!.damageLevel).toBe("PARTIAL");
    expect(saved!.photoKey).toBeTruthy();
  });

  it("returns 201 quickly and does not block on queue enqueue failures", async () => {
    const aiAddSpy = jest
      .spyOn(aiQueue, "add")
      .mockRejectedValueOnce(new Error("queue unavailable"));
    const translationAddSpy = jest
      .spyOn(translationQueue, "add")
      .mockRejectedValueOnce(new Error("queue unavailable"));

    const start = Date.now();
    const response = await attachMultipart(
      request(app.getHttpServer()).post("/api/v1/reports"),
      seededCrisisId,
    );
    const elapsedMs = Date.now() - start;

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(elapsedMs).toBeLessThan(2000);

    aiAddSpy.mockRestore();
    translationAddSpy.mockRestore();
  });

  it("eventually persists AI analysis and all 6 translations", async () => {
    const reportId = `e2e-job-${Date.now()}`;
    const description = "Observed heavy damage";

    await prisma.report.create({
      data: {
        id: reportId,
        crisisId: seededCrisisId,
        damageLevel: "PARTIAL",
        infraType: "RESIDENTIAL",
        crisisType: "EARTHQUAKE",
        hasDebris: false,
        collectedAt: new Date(),
        description,
        electricityCondition: "SEVERE_DAMAGE",
        healthServicesFunctioning: "PARTIALLY_FUNCTIONAL",
        pressingNeeds: ["FOOD_WATER"],
        extraFields: {},
        latitude: 36.2021,
        longitude: 36.1601,
        photoKey: "reports/test/photo.jpg",
      },
    });

    await aiWorker.process({
      data: {
        reportId,
        photoKey: "reports/test/photo.jpg",
      },
    } as never);

    const languages = ["ar", "zh", "en", "fr", "ru", "es"];
    for (const lang of languages) {
      await translationWorker.process({
        data: {
          reportId,
          description,
          targetLanguage: lang,
        },
      } as never);
    }

    const deadline = Date.now() + 15_000;
    let updated = await prisma.report.findUnique({ where: { id: reportId } });

    while (
      Date.now() < deadline &&
      (!updated?.aiDamageLevel ||
        !updated.aiAnalyzedAt ||
        !hasAllTranslations(updated.extraFields, languages))
    ) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      updated = await prisma.report.findUnique({ where: { id: reportId } });
    }

    expect(updated).not.toBeNull();
    expect(updated?.aiDamageLevel).toBeDefined();
    expect(updated?.aiConfidence).toBeGreaterThanOrEqual(0);
    expect(updated?.aiAnalyzedAt).toBeDefined();
    expect(hasAllTranslations(updated?.extraFields, languages)).toBe(true);
  }, 20000);

  it("returns 400 VALIDATION_ERROR when photo is missing", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer()).post("/api/v1/reports"),
      seededCrisisId,
      {},
      false,
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
  });

  it("returns 429 with Retry-After on 11th request in one hour", async () => {
    const ip = "203.0.113.10";

    for (let i = 0; i < 10; i++) {
      const okResponse = await attachMultipart(
        request(app.getHttpServer())
          .post("/api/v1/reports")
          .set("X-Forwarded-For", ip),
        seededCrisisId,
      );

      expect(okResponse.status).toBe(201);
    }

    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", ip),
      seededCrisisId,
    );

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    expect(response.body.error.message).toBe(
      "Rate limit exceeded. Please retry later.",
    );
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("applies rate limit independently per anonymous client IP", async () => {
    const limitedIp = "203.0.113.11";
    const freshIp = "203.0.113.12";

    for (let i = 0; i < 10; i++) {
      const okResponse = await attachMultipart(
        request(app.getHttpServer())
          .post("/api/v1/reports")
          .set("X-Forwarded-For", limitedIp),
        seededCrisisId,
      );

      expect(okResponse.status).toBe(201);
    }

    const throttledResponse = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", limitedIp),
      seededCrisisId,
    );

    expect(throttledResponse.status).toBe(429);
    expect(throttledResponse.body.success).toBe(false);
    expect(throttledResponse.body.error.code).toBe(
      ErrorCode.RATE_LIMIT_EXCEEDED,
    );
    expect(throttledResponse.headers["retry-after"]).toBeDefined();

    const freshIpResponse = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", freshIp),
      seededCrisisId,
    );

    expect(freshIpResponse.status).toBe(201);
  });

  it("GET /api/v1/reports returns GeoJSON and excludes duplicate/superseded records by default", async () => {
    await prisma.report.createMany({
      data: [
        {
          id: `map-primary-${Date.now()}`,
          crisisId: seededCrisisId,
          damageLevel: "PARTIAL",
          infraType: "RESIDENTIAL",
          crisisType: "EARTHQUAKE",
          hasDebris: false,
          collectedAt: new Date(),
          electricityCondition: "SEVERE_DAMAGE",
          healthServicesFunctioning: "PARTIALLY_FUNCTIONAL",
          pressingNeeds: ["FOOD_WATER"],
          extraFields: {},
          latitude: 36.2,
          longitude: 36.16,
          isDuplicate: false,
          supersededById: null,
        },
        {
          id: `map-duplicate-${Date.now()}`,
          crisisId: seededCrisisId,
          damageLevel: "COMPLETE",
          infraType: "RESIDENTIAL",
          crisisType: "EARTHQUAKE",
          hasDebris: false,
          collectedAt: new Date(),
          electricityCondition: "NO_DAMAGE",
          healthServicesFunctioning: "FULLY_FUNCTIONAL",
          pressingNeeds: ["SHELTER_REPAIR"],
          extraFields: {},
          latitude: 36.21,
          longitude: 36.17,
          isDuplicate: true,
          supersededById: null,
        },
      ],
    });

    const response = await request(app.getHttpServer()).get(
      `/api/v1/reports?crisisId=${seededCrisisId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.type).toBe("FeatureCollection");
    expect(Array.isArray(response.body.features)).toBe(true);
    expect(response.body.features.every((f: any) => f.type === "Feature")).toBe(
      true,
    );
    expect(
      response.body.features.some(
        (f: any) => f.properties.isDuplicate === true,
      ),
    ).toBe(false);
  });

  it("increments version for same building and keeps only newest in default map feed", async () => {
    const first = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.42"),
      seededCrisisId,
      {
        buildingId: "building-42",
      },
    );
    const second = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.42"),
      seededCrisisId,
      {
        buildingId: "building-42",
      },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.version).toBeGreaterThan(first.body.data.version);

    const firstDb = await prisma.report.findUnique({
      where: { id: first.body.data.id },
    });
    expect(firstDb?.supersededById).toBe(second.body.data.id);

    const mapResponse = await request(app.getHttpServer()).get(
      `/api/v1/reports?crisisId=${seededCrisisId}`,
    );
    const ids = mapResponse.body.features.map((f: any) => f.id);
    expect(ids).toContain(second.body.data.id);
    expect(ids).not.toContain(first.body.data.id);
  });

  it("GET /api/v1/reports/:id/history returns newest-first history for same building", async () => {
    const first = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.43"),
      seededCrisisId,
      {
        buildingId: "building-history-1",
      },
    );
    const second = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.43"),
      seededCrisisId,
      {
        buildingId: "building-history-1",
      },
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const response = await request(app.getHttpServer()).get(
      `/api/v1/reports/${second.body.data.id}/history`,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    // data must be a flat array of ReportVersionSummary
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body.data.length).toBeGreaterThanOrEqual(2);
    expect(response.body.data[0].id).toBe(second.body.data.id);
    expect(response.body.data[1].id).toBe(first.body.data.id);
    // isCurrent must only be true for the most recent version
    expect(response.body.data[0].isCurrent).toBe(true);
    expect(response.body.data[1].isCurrent).toBe(false);
    // each item must have ReportVersionSummary fields
    expect(response.body.data[0]).toHaveProperty("version");
    expect(response.body.data[0]).toHaveProperty("damageLevel");
    expect(response.body.data[0]).toHaveProperty("submittedAt");
  });

  it("GET /api/v1/analytics/hotspots returns hotspot clusters", async () => {
    const response = await request(app.getHttpServer()).get(
      `/api/v1/analytics/hotspots?crisisId=${seededCrisisId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("POST /api/v1/reports/export returns 401 without bearer token", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/reports/export")
      .send({
        crisisId: seededCrisisId,
        format: "csv",
      });

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it("GET /api/v1/reports/stream returns 401 without bearer token", async () => {
    const response = await request(app.getHttpServer()).get(
      `/api/v1/reports/stream?crisisId=${seededCrisisId}`,
    );

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
  });

  it("GET /api/v1/reports/stream returns 403 for non-admin role", async () => {
    const viewerToken = createTestJwt(authJwtSecret, {
      sub: "viewer-user",
      role: "viewer",
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/reports/stream?crisisId=${seededCrisisId}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it("POST /api/v1/reports/export returns 403 for non-admin role", async () => {
    const viewerToken = createTestJwt(authJwtSecret, {
      sub: "viewer-user",
      role: "viewer",
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/reports/export")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        crisisId: seededCrisisId,
        format: "csv",
      });

    expect(response.status).toBe(403);
  });

  it("POST /api/v1/reports/export returns validation error for unsupported format", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-invalid-format",
      role: "admin",
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/reports/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Forwarded-For", "203.0.113.82")
      .send({
        crisisId: seededCrisisId,
        format: "xlsx",
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(response.body.error.message).toBe(
      "format must be csv, geojson, or shapefile",
    );
  });

  it("POST /api/v1/reports/export returns 202 and GET status resolves with job state", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-user",
      role: "admin",
    });

    const createResponse = await request(app.getHttpServer())
      .post("/api/v1/reports/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Forwarded-For", "203.0.113.83")
      .send({
        crisisId: seededCrisisId,
        format: "shapefile",
      });

    expect(createResponse.status).toBe(202);
    expect(createResponse.body.jobId).toBeDefined();

    const statusResponse = await request(app.getHttpServer())
      .get(`/api/v1/reports/export/${createResponse.body.jobId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(statusResponse.status).toBe(200);
    expect(statusResponse.body.jobId).toBe(createResponse.body.jobId);
    expect(["queued", "processing", "completed", "failed"]).toContain(
      statusResponse.body.status,
    );
  });

  it("POST /api/v1/reports/export returns 429 after admin rate limit is exceeded", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-throttle",
      role: "admin",
    });

    const first = await request(app.getHttpServer())
      .post("/api/v1/reports/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Forwarded-For", "203.0.113.55")
      .send({ crisisId: seededCrisisId, format: "csv" });

    const second = await request(app.getHttpServer())
      .post("/api/v1/reports/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Forwarded-For", "203.0.113.55")
      .send({ crisisId: seededCrisisId, format: "csv" });

    const third = await request(app.getHttpServer())
      .post("/api/v1/reports/export")
      .set("Authorization", `Bearer ${adminToken}`)
      .set("X-Forwarded-For", "203.0.113.55")
      .send({ crisisId: seededCrisisId, format: "csv" });

    expect([first.status, second.status, third.status]).toContain(429);
    const throttled = [first, second, third].find(
      (resp) => resp.status === 429,
    );
    expect(throttled?.body.message).toBeDefined();
  });

  it("GET /api/v1/reports/:id returns full report detail", async () => {
    const submitResponse = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.60"),
      seededCrisisId,
    );

    expect(submitResponse.status).toBe(201);
    const reportId = submitResponse.body.data.id;

    const response = await request(app.getHttpServer()).get(
      `/api/v1/reports/${reportId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.id).toBe(reportId);
    expect(response.body.data.crisisId).toBe(seededCrisisId);
    expect(response.body.data.damageLevel).toBe("PARTIAL");
    expect(response.body.data.electricityCondition).toBe("SEVERE_DAMAGE");
    expect(response.body.data.healthServicesFunctioning).toBe(
      "PARTIALLY_FUNCTIONAL",
    );
    expect(response.body.data.pressingNeeds).toContain("FOOD_WATER");
    expect(response.body.data.infraType).toBe("RESIDENTIAL");
    expect(response.body.data.photoUrl).toBeDefined();
    expect(response.body.data.submittedAt).toBeDefined();
  });

  it("GET /api/v1/reports/:id returns 404 for unknown id", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/v1/reports/00000000-0000-0000-0000-000000000000",
    );

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("REPORT_NOT_FOUND");
  });

  it("DELETE /api/v1/reports/:id returns 401 without bearer token", async () => {
    const response = await request(app.getHttpServer()).delete(
      "/api/v1/reports/some-id",
    );

    expect(response.status).toBe(401);
  });

  it("DELETE /api/v1/reports/:id returns 403 for non-admin role", async () => {
    const viewerToken = createTestJwt(authJwtSecret, {
      sub: "viewer-user",
      role: "viewer",
    });

    const response = await request(app.getHttpServer())
      .delete("/api/v1/reports/some-id")
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(response.status).toBe(403);
  });

  it("DELETE /api/v1/reports/:id returns 404 for unknown report", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-delete-user",
      role: "admin",
    });

    const response = await request(app.getHttpServer())
      .delete("/api/v1/reports/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("REPORT_NOT_FOUND");
  });

  it("DELETE /api/v1/reports/:id returns 204 for admin", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-delete-user",
      role: "admin",
    });

    const submitResponse = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.70"),
      seededCrisisId,
    );

    expect(submitResponse.status).toBe(201);
    const reportId = submitResponse.body.data.id;

    const deleteResponse = await request(app.getHttpServer())
      .delete(`/api/v1/reports/${reportId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(deleteResponse.status).toBe(204);

    const getResponse = await request(app.getHttpServer()).get(
      `/api/v1/reports/${reportId}`,
    );
    expect(getResponse.status).toBe(404);
  });

  it("POST /api/v1/reports/:id/anonymize returns 401 without bearer token", async () => {
    const response = await request(app.getHttpServer()).post(
      "/api/v1/reports/some-id/anonymize",
    );

    expect(response.status).toBe(401);
  });

  it("POST /api/v1/reports/:id/anonymize returns 403 for non-admin role", async () => {
    const viewerToken = createTestJwt(authJwtSecret, {
      sub: "viewer-user",
      role: "viewer",
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/reports/some-id/anonymize")
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(response.status).toBe(403);
  });

  it("POST /api/v1/reports/:id/anonymize returns 404 for unknown report", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-anon-user",
      role: "admin",
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/reports/00000000-0000-0000-0000-000000000000/anonymize")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("REPORT_NOT_FOUND");
  });

  it("POST /api/v1/reports/:id/anonymize returns 200 for admin", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-anon-user",
      role: "admin",
    });

    const submitResponse = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.71"),
      seededCrisisId,
    );

    expect(submitResponse.status).toBe(201);
    const reportId = submitResponse.body.data.id;

    const anonymizeResponse = await request(app.getHttpServer())
      .post(`/api/v1/reports/${reportId}/anonymize`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(anonymizeResponse.status).toBe(200);
    expect(anonymizeResponse.body.success).toBe(true);
    expect(anonymizeResponse.body.data.id).toBe(reportId);
    expect(typeof anonymizeResponse.body.data.anonymizedAt).toBe("string");
  });

  it("PATCH /api/v1/reports/:id returns 401 without bearer token", async () => {
    const response = await request(app.getHttpServer())
      .patch("/api/v1/reports/some-id")
      .send({ moderationStatus: "APPROVED" });

    expect(response.status).toBe(401);
  });

  it("PATCH /api/v1/reports/:id returns 403 for non-admin role", async () => {
    const viewerToken = createTestJwt(authJwtSecret, {
      sub: "viewer-user",
      role: "viewer",
    });

    const response = await request(app.getHttpServer())
      .patch("/api/v1/reports/some-id")
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ moderationStatus: "APPROVED" });

    expect(response.status).toBe(403);
  });

  it("GET /api/v1/reports/:id/audit returns 401 without bearer token", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/v1/reports/some-id/audit",
    );

    expect(response.status).toBe(401);
  });

  it("GET /api/v1/reports/:id/audit returns 403 for non-admin role", async () => {
    const viewerToken = createTestJwt(authJwtSecret, {
      sub: "viewer-user",
      role: "viewer",
    });

    const response = await request(app.getHttpServer())
      .get("/api/v1/reports/some-id/audit")
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(response.status).toBe(403);
  });

  it("GET /api/v1/reports/:id/audit returns 404 for unknown report", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-user",
      role: "admin",
    });

    const response = await request(app.getHttpServer())
      .get("/api/v1/reports/00000000-0000-0000-0000-000000000000/audit")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe("REPORT_NOT_FOUND");
  });

  it("PATCH /api/v1/reports/:id returns 404 for unknown report", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-user",
      role: "admin",
    });

    const response = await request(app.getHttpServer())
      .patch("/api/v1/reports/00000000-0000-0000-0000-000000000000")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ moderationStatus: "APPROVED" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("REPORT_NOT_FOUND");
  });

  it("PATCH /api/v1/reports/:id moderates a report (admin only)", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-mod-user",
      role: "admin",
    });

    // Submit a report first using the helper to get a valid payload
    const submitRes = await attachMultipart(
      request(app.getHttpServer()).post("/api/v1/reports"),
      seededCrisisId,
      { infraName: "Mod Test Building", description: "Test moderation" },
    );

    expect(submitRes.status).toBe(201);
    const reportId = submitRes.body.data.id as string;

    // Moderate it
    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/reports/${reportId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        moderationStatus: "FLAGGED",
        moderationNote: "Needs field verification",
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.success).toBe(true);
    expect(patchRes.body.data.moderationStatus).toBe("FLAGGED");
    expect(patchRes.body.data.moderationNote).toBe("Needs field verification");
    expect(patchRes.body.data.moderatedBy).toBe("admin-mod-user");
    expect(patchRes.body.data.moderatedAt).toBeTruthy();
  });

  it("PATCH /api/v1/reports/:id returns 400 for invalid moderationStatus", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-user",
      role: "admin",
    });

    const response = await request(app.getHttpServer())
      .patch("/api/v1/reports/some-id")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ moderationStatus: "INVALID_STATUS" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("GET /api/v1/reports/:id/audit returns paginated moderation audit entries for admins", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-audit-user",
      role: "admin",
    });

    const submitRes = await attachMultipart(
      request(app.getHttpServer()).post("/api/v1/reports"),
      seededCrisisId,
      { infraName: "Audit Test Building", description: "Test audit" },
    );

    expect(submitRes.status).toBe(201);
    const reportId = submitRes.body.data.id as string;

    const firstModeration = await request(app.getHttpServer())
      .patch(`/api/v1/reports/${reportId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        moderationStatus: "UNDER_REVIEW",
        moderationNote: "Initial triage",
      });

    expect(firstModeration.status).toBe(200);

    const secondModeration = await request(app.getHttpServer())
      .patch(`/api/v1/reports/${reportId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        moderationStatus: "APPROVED",
        moderationNote: "Verified by field team",
      });

    expect(secondModeration.status).toBe(200);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/reports/${reportId}/audit?page=1&pageSize=1`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data.items)).toBe(true);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0].reportId).toBe(reportId);
    expect(response.body.data.items[0].action).toBe(
      "REPORT_MODERATION_UPDATED",
    );
    expect(response.body.data.pagination.page).toBe(1);
    expect(response.body.data.pagination.pageSize).toBe(1);
    expect(response.body.data.pagination.totalItems).toBeGreaterThanOrEqual(2);
    expect(response.body.data.pagination.totalPages).toBeGreaterThanOrEqual(2);
  });

  // ── PressingNeed enum parity ──────────────────────────────────────────────

  it("accepts CASH_ASSISTANCE as a pressing need value", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.201"),
      seededCrisisId,
      { pressingNeeds: JSON.stringify(["CASH_ASSISTANCE"]) },
    );
    expect(response.status).toBe(201);
  });

  it("accepts SHELTER_REPAIR as a pressing need value", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.202"),
      seededCrisisId,
      { pressingNeeds: JSON.stringify(["SHELTER_REPAIR"]) },
    );
    expect(response.status).toBe(201);
  });

  it("rejects SHELTER (old enum value) as a pressing need", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.203"),
      seededCrisisId,
      { pressingNeeds: JSON.stringify(["SHELTER"]) },
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects CASH_FINANCIAL (old enum value) as a pressing need", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.204"),
      seededCrisisId,
      { pressingNeeds: JSON.stringify(["CASH_FINANCIAL"]) },
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts OTHER and persists pressingNeedsOther text", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.205"),
      seededCrisisId,
      {
        pressingNeeds: JSON.stringify(["OTHER"]),
        pressingNeedsOther: "Emergency generators needed",
      },
    );
    expect(response.status).toBe(201);

    const saved = await prisma.report.findUnique({
      where: { id: response.body.data.id },
    });
    expect(saved?.pressingNeedsOther).toBe("Emergency generators needed");
  });

  it("rejects pressingNeedsOther longer than 500 chars", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.206"),
      seededCrisisId,
      {
        pressingNeeds: JSON.stringify(["OTHER"]),
        pressingNeedsOther: "x".repeat(501),
      },
    );
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  // ── descriptionLang capture ───────────────────────────────────────────────

  it("persists descriptionLang from payload", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.207"),
      seededCrisisId,
      { descriptionLang: "ar" },
    );
    expect(response.status).toBe(201);

    const saved = await prisma.report.findUnique({
      where: { id: response.body.data.id },
    });
    expect(saved?.descriptionLang).toBe("ar");
  });

  it("defaults descriptionLang to en when not provided", async () => {
    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.208"),
      seededCrisisId,
    );
    expect(response.status).toBe(201);

    const saved = await prisma.report.findUnique({
      where: { id: response.body.data.id },
    });
    expect(saved?.descriptionLang).toBe("en");
  });

  it("returns descriptionLang in GET /api/v1/reports/:id response", async () => {
    const submitResponse = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.209"),
      seededCrisisId,
      { descriptionLang: "zh" },
    );
    expect(submitResponse.status).toBe(201);
    const reportId = submitResponse.body.data.id;

    const getResponse = await request(app.getHttpServer()).get(
      `/api/v1/reports/${reportId}`,
    );
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data.descriptionLang).toBe("zh");
  });

  it("accepts reporterId field and returns 201", async () => {
    const submitResponse = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.210"),
      seededCrisisId,
      { reporterId: "reporter-contract-test-user" },
    );
    expect(submitResponse.status).toBe(201);
    expect(submitResponse.body.data.id).toBeDefined();
  });

  it("GET /api/v1/reports/:id/history returns chain for coordinate-only reports", async () => {
    const sharedLat = "37.9010";
    const sharedLon = "29.1010";

    const firstRes = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.211"),
      seededCrisisId,
      { latitude: sharedLat, longitude: sharedLon, infraName: "Coord History Building" },
    );
    expect(firstRes.status).toBe(201);

    const secondRes = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.212"),
      seededCrisisId,
      { latitude: sharedLat, longitude: sharedLon, infraName: "Coord History Building v2" },
    );
    expect(secondRes.status).toBe(201);

    const historyRes = await request(app.getHttpServer()).get(
      `/api/v1/reports/${secondRes.body.data.id}/history`,
    );

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.success).toBe(true);
    expect(Array.isArray(historyRes.body.data)).toBe(true);
    expect(historyRes.body.data.length).toBeGreaterThanOrEqual(2);
    const ids = historyRes.body.data.map((r: { id: string }) => r.id);
    expect(ids).toContain(firstRes.body.data.id);
    expect(ids).toContain(secondRes.body.data.id);
  });

  it("GET /api/v1/reports/:id does not expose AI or moderation fields", async () => {
    const submitResponse = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.213"),
      seededCrisisId,
    );
    expect(submitResponse.status).toBe(201);
    const reportId = submitResponse.body.data.id;

    const getResponse = await request(app.getHttpServer()).get(
      `/api/v1/reports/${reportId}`,
    );

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.data).not.toHaveProperty("aiDamageLevel");
    expect(getResponse.body.data).not.toHaveProperty("aiConfidence");
    expect(getResponse.body.data).not.toHaveProperty("aiAnalyzedAt");
    expect(getResponse.body.data).not.toHaveProperty("moderationStatus");
    expect(getResponse.body.data).not.toHaveProperty("moderationNote");
    expect(getResponse.body.data).not.toHaveProperty("moderatedAt");
    expect(getResponse.body.data).not.toHaveProperty("moderatedBy");
  });

  it("submit populates deviceHash and ipHash fields in DB", async () => {
    const submitResponse = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "203.0.113.214")
        .set("User-Agent", "TestBrowser/1.0"),
      seededCrisisId,
    );
    expect(submitResponse.status).toBe(201);
    const reportId = submitResponse.body.data.id;

    const saved = await prisma.report.findUnique({ where: { id: reportId } });
    expect(saved?.ipHash).toBeTruthy();
    expect(saved?.deviceHash).toBeTruthy();
  });
});

describe("POST /api/v1/reports idempotency key (F6)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let seededCrisisId: string;
  let aiQueue: Queue;
  let translationQueue: Queue;

  const testConfigValues: Record<string, string | number> = {
    DATABASE_URL: "postgresql://crisismap:crisismap@localhost:5432/crisismap",
    BETTER_AUTH_SECRET: "test-auth-jwt-secret",
    BETTER_AUTH_JWT_ISSUER: "crisismap-tests",
    BETTER_AUTH_JWT_AUDIENCE: "crisismap-admin",
    RATE_LIMIT_PER_HOUR: 100,
    RATE_LIMIT_ADMIN_EXPORT_PER_MINUTE: 30,
    REDIS_DB: 1,
    AI_CLASSIFICATION_ADAPTER: "mock",
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, defaultValue?: unknown) =>
          key in testConfigValues ? testConfigValues[key] : defaultValue,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    prisma = moduleRef.get(PrismaService);
    aiQueue = moduleRef.get<Queue>(getQueueToken("ai-classification"));
    translationQueue = moduleRef.get<Queue>(
      getQueueToken("description-translation"),
    );

    const crisis = await prisma.crisis.create({
      data: {
        name: "Idempotency E2E Crisis",
        type: "EARTHQUAKE",
        country: "Syria",
        startedAt: new Date("2026-01-01"),
      },
    });
    seededCrisisId = crisis.id;
  });

  afterAll(async () => {
    await aiQueue.drain(true);
    await translationQueue.drain(true);

    const reportIds = await prisma.report.findMany({
      where: { crisisId: seededCrisisId },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: { reportId: { in: reportIds.map((r) => r.id) } },
    });
    await prisma.report.deleteMany({ where: { crisisId: seededCrisisId } });
    await prisma.crisis.delete({ where: { id: seededCrisisId } });
    await app.close();
  });

  it("first submission with X-Idempotency-Key returns 201", async () => {
    const ikey = `ikey-first-${Date.now()}`;
    const response = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Idempotency-Key", ikey),
      seededCrisisId,
      { latitude: "36.21", longitude: "36.17", infraName: "Idem building 1" },
    );

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(typeof response.body.data.id).toBe("string");
  });

  it("replayed submission with same X-Idempotency-Key returns 200 with same report id", async () => {
    const ikey = `ikey-replay-${Date.now()}`;

    const first = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Idempotency-Key", ikey),
      seededCrisisId,
      { latitude: "36.22", longitude: "36.18", infraName: "Idem building 2" },
    );
    expect(first.status).toBe(201);
    const originalId = first.body.data.id as string;

    const replay = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Idempotency-Key", ikey),
      seededCrisisId,
      { latitude: "36.22", longitude: "36.18", infraName: "Idem building 2" },
    );

    expect(replay.status).toBe(200);
    expect(replay.body.success).toBe(true);
    expect(replay.body.data.id).toBe(originalId);
  });

  it("replay does not create a duplicate DB row", async () => {
    const ikey = `ikey-nodupe-${Date.now()}`;

    await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Idempotency-Key", ikey),
      seededCrisisId,
      { latitude: "36.23", longitude: "36.19", infraName: "Idem building 3" },
    );
    await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Idempotency-Key", ikey),
      seededCrisisId,
      { latitude: "36.23", longitude: "36.19", infraName: "Idem building 3" },
    );

    const rows = await prisma.report.findMany({
      where: { crisisId: seededCrisisId, infraName: "Idem building 3" },
    });
    expect(rows).toHaveLength(1);
  });

  it("different idempotency keys create separate reports (201 each)", async () => {
    const keyA = `ikey-A-${Date.now()}`;
    const keyB = `ikey-B-${Date.now()}`;

    const resA = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Idempotency-Key", keyA),
      seededCrisisId,
      { latitude: "36.24", longitude: "36.20", infraName: "Idem building A" },
    );
    const resB = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Idempotency-Key", keyB),
      seededCrisisId,
      { latitude: "36.25", longitude: "36.21", infraName: "Idem building B" },
    );

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(resA.body.data.id).not.toBe(resB.body.data.id);
  });
});

describe("GET /api/v1/reports/export/:jobId — completed state response shape", () => {
  let app: INestApplication;
  let queueService: QueueService;
  let storageService: ReportStorageService;
  const authJwtSecret = "test-export-shape-secret";

  const testConfigValues: Record<string, string | number> = {
    DATABASE_URL: "postgresql://crisismap:crisismap@localhost:5432/crisismap",
    BETTER_AUTH_SECRET: authJwtSecret,
    BETTER_AUTH_JWT_ISSUER: "crisismap-tests",
    BETTER_AUTH_JWT_AUDIENCE: "crisismap-admin",
    RATE_LIMIT_PER_HOUR: 100,
    RATE_LIMIT_ADMIN_EXPORT_PER_MINUTE: 100,
    REDIS_DB: 1,
    AI_CLASSIFICATION_ADAPTER: "mock",
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string, defaultValue?: unknown) =>
          key in testConfigValues ? testConfigValues[key] : defaultValue,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    queueService = moduleRef.get(QueueService);
    storageService = moduleRef.get(ReportStorageService);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns url and expiresAt (not downloadUrl) when export job is completed", async () => {
    const adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-export-shape",
      role: "admin",
    });

    const mockCompletedJob = {
      getState: jest.fn().mockResolvedValue("completed"),
      returnvalue: { objectKey: "exports/test-shape-42.csv" },
      failedReason: null,
    };

    const getJobSpy = jest
      .spyOn(queueService, "getReportsExportJob")
      .mockResolvedValueOnce(mockCompletedJob);

    const storageUrlSpy = jest
      .spyOn(storageService, "createSignedDownloadUrl")
      .mockResolvedValueOnce(
        "https://storage.example.com/exports/file.csv?sig=test",
      );

    const response = await request(app.getHttpServer())
      .get("/api/v1/reports/export/test-shape-42")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.jobId).toBe("test-shape-42");
    expect(response.body.status).toBe("completed");
    // contract: completed state must expose url + expiresAt, not downloadUrl
    expect(response.body.url).toBeDefined();
    expect(response.body.expiresAt).toBeDefined();
    expect(response.body).not.toHaveProperty("downloadUrl");

    getJobSpy.mockRestore();
    storageUrlSpy.mockRestore();
  });
});

function hasAllTranslations(
  extraFields: unknown,
  languages: string[],
): boolean {
  if (
    !extraFields ||
    typeof extraFields !== "object" ||
    Array.isArray(extraFields)
  ) {
    return false;
  }

  const translations = (extraFields as Record<string, unknown>).translations;
  if (
    !translations ||
    typeof translations !== "object" ||
    Array.isArray(translations)
  ) {
    return false;
  }

  const map = translations as Record<string, unknown>;
  return languages.every(
    (lang) => typeof map[lang] === "string" && map[lang].length > 0,
  );
}

function createTestJwt(
  secret: string,
  payload: {
    sub: string;
    role: string;
  },
): string {
  return sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: "1h",
    issuer: "crisismap-tests",
    audience: "crisismap-admin",
  });
}
