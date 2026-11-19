import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PressingNeed } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

jest.setTimeout(900000);

async function cleanupCrisisData(
  prisma: PrismaService,
  crisisId: string,
): Promise<void> {
  const maxAttempts = 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await prisma.auditLog.deleteMany({
      where: {
        report: { crisisId },
      },
    });

    await prisma.report.deleteMany({ where: { crisisId } });

    const remainingReports = await prisma.report.count({ where: { crisisId } });
    if (remainingReports > 0) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      continue;
    }

    try {
      await prisma.crisis.deleteMany({ where: { id: crisisId } });
      return;
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `Failed to clean up crisis ${crisisId} after ${maxAttempts} attempts`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

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

describe("Scale and abuse control e2e", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdCrisisIds: string[] = [];

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

  async function createScaleCrisis(name: string): Promise<string> {
    const crisis = await prisma.crisis.create({
      data: {
        name,
        type: "EARTHQUAKE",
        country: "Syria",
        startedAt: new Date("2026-01-01"),
      },
    });

    createdCrisisIds.push(crisis.id);
    return crisis.id;
  }

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
  });

  afterEach(async () => {
    const crisisId = createdCrisisIds.pop();
    if (!crisisId) {
      return;
    }

    await cleanupCrisisData(prisma, crisisId);
  });

  afterAll(async () => {
    while (createdCrisisIds.length > 0) {
      const crisisId = createdCrisisIds.pop();
      if (!crisisId) {
        continue;
      }
      await cleanupCrisisData(prisma, crisisId);
    }

    await app.close();
  });

  it("lists 1,000 inserted reports with valid cursor pagination in under 2,000ms", async () => {
    const crisisId = await createScaleCrisis("Scale Bulk Test Crisis");
    const now = Date.now();

    for (let batch = 0; batch < 10; batch++) {
      const rows = Array.from({ length: 100 }, (_, index) => {
        const item = batch * 100 + index;
        return {
          id: `scale-bulk-${now}-${item}`,
          crisisId,
          damageLevel: "PARTIAL" as const,
          infraType: "RESIDENTIAL" as const,
          infraName: `Bulk ${item}`,
          crisisType: "EARTHQUAKE" as const,
          hasDebris: false,
          collectedAt: new Date(now - item * 1000),
          description: "Bulk scale report",
          electricityCondition: "SEVERE_DAMAGE" as const,
          healthServicesFunctioning: "PARTIALLY_FUNCTIONAL" as const,
          pressingNeeds: [PressingNeed.FOOD_WATER],
          extraFields: {},
          latitude: 36.2 + item * 0.00001,
          longitude: 36.16 + item * 0.00001,
          isDuplicate: false,
          version: 1,
          submittedAt: new Date(now - item * 1000),
        };
      });

      await prisma.report.createMany({ data: rows });
    }

    const startedAt = Date.now();
    const firstPage = await request(app.getHttpServer()).get(
      `/api/v1/reports?crisisId=${crisisId}`,
    );
    const elapsedMs = Date.now() - startedAt;

    expect(firstPage.status).toBe(200);
    expect(elapsedMs).toBeLessThan(2000);
    expect(firstPage.body.type).toBe("FeatureCollection");
    expect(firstPage.body.features).toHaveLength(100);
    expect(firstPage.body.meta.limit).toBe(100);
    expect(typeof firstPage.body.meta.nextCursor).toBe("string");

    const nextCursor: string = firstPage.body.meta.nextCursor;
    const secondPage = await request(app.getHttpServer()).get(
      `/api/v1/reports?crisisId=${crisisId}&cursor=${encodeURIComponent(nextCursor)}`,
    );

    expect(secondPage.status).toBe(200);
    expect(secondPage.body.features).toHaveLength(100);

    const firstIds = new Set<string>(
      firstPage.body.features.map((feature: { id: string }) => feature.id),
    );
    const overlapping = secondPage.body.features.filter(
      (feature: { id: string }) => firstIds.has(feature.id),
    );
    expect(overlapping).toHaveLength(0);
  });

  it("handles 11 rapid submissions with only 201 or 429 responses", async () => {
    const crisisId = await createScaleCrisis("Scale Concurrent Submit Crisis");

    const responses: request.Response[] = [];

    for (let index = 0; index < 11; index++) {
      const response = await attachMultipart(
        request(app.getHttpServer())
          .post("/api/v1/reports")
          .set("X-Forwarded-For", "198.51.100.30"),
        crisisId,
        {
          infraName: `Concurrent report ${index}`,
          latitude: String(36.2021 + index * 0.0001),
          longitude: String(36.1601 + index * 0.0001),
        },
      );

      responses.push(response);
    }

    const statuses = responses.map((response) => response.status);

    expect(responses).toHaveLength(11);
    expect(statuses.every((status) => status === 201 || status === 429)).toBe(
      true,
    );
    expect(statuses.some((status) => status === 201)).toBe(true);
    expect(statuses.some((status) => status === 429)).toBe(true);
    expect(statuses.some((status) => status >= 500)).toBe(false);
  });

  it("flags duplicate flood submissions so exactly one remains primary", async () => {
    const crisisId = await createScaleCrisis("Scale Duplicate Flood Crisis");
    const collectedAt = new Date().toISOString();

    const primary = await attachMultipart(
      request(app.getHttpServer())
        .post("/api/v1/reports")
        .set("X-Forwarded-For", "198.51.100.31"),
      crisisId,
      {
        infraName: "Duplicate flood primary",
        collectedAt,
        latitude: "36.2222",
        longitude: "36.1888",
      },
    );

    expect(primary.status).toBe(201);

    const settled = await Promise.allSettled(
      Array.from({ length: 9 }, (_, index) => 
        attachMultipart(
          request(app.getHttpServer())
            .post("/api/v1/reports")
            .set("X-Forwarded-For", "198.51.100.31"),
          crisisId,
          {
            infraName: `Duplicate flood ${index}`,
            collectedAt,
            latitude: "36.2222",
            longitude: "36.1888",
          },
        ).retry(2)
      ),
    );

    const rejected = settled.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(0);

    const floodResponses = settled
      .filter(
        (result): result is PromiseFulfilledResult<request.Response> =>
          result.status === "fulfilled",
      )
      .map((result) => result.value);

    const responses = [primary, ...floodResponses];

    expect(responses.every((response) => response.status === 201)).toBe(true);

    const createdIds = responses.map(
      (response) => response.body.data.id as string,
    );
    const persisted = await prisma.report.findMany({
      where: {
        id: {
          in: createdIds,
        },
      },
      select: {
        id: true,
        isDuplicate: true,
      },
    });

    expect(persisted).toHaveLength(10);
    expect(
      persisted.filter((report) => report.isDuplicate === false),
    ).toHaveLength(1);
    expect(
      persisted.filter((report) => report.isDuplicate === true),
    ).toHaveLength(9);
  });

  it("lists 10,000 seeded reports with valid pagination response under 3,500ms", async () => {
    const crisisId = await createScaleCrisis("10k Scale List Test");
    const now = Date.now();

    for (let batchIndex = 0; batchIndex < 10; batchIndex++) {
      await prisma.report.createMany({
        data: Array.from({ length: 1000 }, (_, i) => {
          const item = batchIndex * 1000 + i;
          return {
            id: `scale-10k-${now}-${item}`,
            crisisId,
            damageLevel: "PARTIAL" as const,
            infraType: "RESIDENTIAL" as const,
            infraName: `Scale10k ${item}`,
            crisisType: "EARTHQUAKE" as const,
            hasDebris: false,
            collectedAt: new Date(now - item * 1000),
            description: "10k scale test",
            electricityCondition: "SEVERE_DAMAGE" as const,
            healthServicesFunctioning: "PARTIALLY_FUNCTIONAL" as const,
            pressingNeeds: [PressingNeed.FOOD_WATER],
            extraFields: {},
            latitude: 36.2 + item * 0.000001,
            longitude: 36.16 + item * 0.000001,
            isDuplicate: false,
            version: 1,
            submittedAt: new Date(now - item * 1000),
          };
        }),
      });
    }

    const start = Date.now();
    const response = await request(app.getHttpServer()).get(
      `/api/v1/reports?crisisId=${crisisId}`,
    );
    const elapsed = Date.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(3500);
    expect(response.body.type).toBe("FeatureCollection");
    expect(response.body.features).toHaveLength(100);
    expect(typeof response.body.meta.nextCursor).toBe("string");
  });

  it("returns analytics hotspots for 10,000 seeded reports under 8,000ms", async () => {
    const crisisId = await createScaleCrisis("10k Scale Analytics Test");
    const now = Date.now();

    for (let batchIndex = 0; batchIndex < 10; batchIndex++) {
      await prisma.report.createMany({
        data: Array.from({ length: 1000 }, (_, i) => {
          const item = batchIndex * 1000 + i;
          return {
            id: `scale-analytics-${now}-${item}`,
            crisisId,
            damageLevel: "PARTIAL" as const,
            infraType: "RESIDENTIAL" as const,
            infraName: `Analytics10k ${item}`,
            crisisType: "EARTHQUAKE" as const,
            hasDebris: false,
            collectedAt: new Date(now - item * 1000),
            description: "analytics scale test",
            electricityCondition: "SEVERE_DAMAGE" as const,
            healthServicesFunctioning: "PARTIALLY_FUNCTIONAL" as const,
            pressingNeeds: [PressingNeed.FOOD_WATER],
            extraFields: {},
            latitude: 36.2 + item * 0.000001,
            longitude: 36.16 + item * 0.000001,
            isDuplicate: false,
            version: 1,
            submittedAt: new Date(now - item * 1000),
          };
        }),
      });
    }

    const start = Date.now();
    const response = await request(app.getHttpServer()).get(
      `/api/v1/analytics/hotspots?crisisId=${crisisId}`,
    );
    const elapsed = Date.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(8000);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });

  it("excludes soft-deleted reports from default GET /reports", async () => {
    const crisisId = await createScaleCrisis("Scale Deleted Filter Crisis");
    const now = Date.now();

    await prisma.report.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        id: `scale-deleted-${now}-${index}`,
        crisisId,
        damageLevel: "PARTIAL" as const,
        infraType: "RESIDENTIAL" as const,
        infraName: `Deleted filter ${index}`,
        crisisType: "EARTHQUAKE" as const,
        hasDebris: false,
        collectedAt: new Date(now - index * 1000),
        description: "Deleted filter report",
        electricityCondition: "SEVERE_DAMAGE" as const,
        healthServicesFunctioning: "PARTIALLY_FUNCTIONAL" as const,
        pressingNeeds: [PressingNeed.FOOD_WATER],
        extraFields: {},
        latitude: 36.25 + index * 0.00001,
        longitude: 36.19 + index * 0.00001,
        isDuplicate: false,
        version: 1,
        deletedAt: index % 2 === 0 ? new Date(now) : null,
      })),
    });

    const response = await request(app.getHttpServer()).get(
      `/api/v1/reports?crisisId=${crisisId}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.type).toBe("FeatureCollection");
    expect(response.body.features).toHaveLength(25);
  });
});
