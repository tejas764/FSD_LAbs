import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import request from "supertest";

jest.mock("../src/auth/better-auth", () => ({
  createBetterAuth: jest.fn(() => ({})),
}));

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { CrisisType } from "@prisma/client";
import { ErrorCode } from "../src/common/error-codes";
import { sign } from "jsonwebtoken";

jest.setTimeout(30000);

describe("Crises API Contract", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const cleanupCrisisIds: string[] = [];
  const cleanupBuildingFootprintIds: string[] = [];
  let authJwtSecret: string;
  let adminToken: string;
  let viewerToken: string;

  const testConfigValues: Record<string, string | number> = {
    DATABASE_URL: "postgresql://crisismap:crisismap@localhost:5432/crisismap",
    BETTER_AUTH_SECRET: "test-auth-jwt-secret",
    BETTER_AUTH_JWT_ISSUER: "crisismap-tests",
    BETTER_AUTH_JWT_AUDIENCE: "crisismap-admin",
    RATE_LIMIT_ADMIN_CRISIS_WRITE_PER_MINUTE: 100,
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

    adminToken = createTestJwt(authJwtSecret, {
      sub: "admin-user",
      role: "admin",
    });
    viewerToken = createTestJwt(authJwtSecret, {
      sub: "viewer-user",
      role: "viewer",
    });
  });

  afterAll(async () => {
    if (cleanupBuildingFootprintIds.length > 0) {
      await prisma.$executeRawUnsafe(
        'DELETE FROM "building_footprint" WHERE id = ANY($1::text[])',
        cleanupBuildingFootprintIds,
      );
    }
    if (cleanupCrisisIds.length > 0) {
      await prisma.crisis.deleteMany({
        where: { id: { in: cleanupCrisisIds } },
      });
    }
    await app.close();
  });

  describe("GET /api/v1/crises", () => {
    it("returns 200 with array of all crises", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/crises");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("returns 200 with only active crises when ?active=true", async () => {
      const response = await request(app.getHttpServer()).get(
        "/api/v1/crises?active=true",
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((crisis: { isActive: boolean }) => {
        expect(crisis.isActive).toBe(true);
      });
    });

    it("excludes future-start active crises from ?active=true", async () => {
      const futureCrisis = await prisma.crisis.create({
        data: {
          name: "Future Active Crisis",
          type: CrisisType.FLOOD,
          country: "TR",
          startedAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
      });
      cleanupCrisisIds.push(futureCrisis.id);

      const response = await request(app.getHttpServer()).get(
        "/api/v1/crises?active=true",
      );

      expect(response.status).toBe(200);
      expect(
        response.body.find(
          (item: { id: string }) => item.id === futureCrisis.id,
        ),
      ).toBeUndefined();
    });

    it("returns 200 with only inactive crises when ?active=false", async () => {
      const response = await request(app.getHttpServer()).get(
        "/api/v1/crises?active=false",
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      response.body.forEach((crisis: { isActive: boolean }) => {
        expect(crisis.isActive).toBe(false);
      });
    });

    it("returns crises in descending order by createdAt", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/crises");

      expect(response.status).toBe(200);
      if (response.body.length > 1) {
        for (let i = 0; i < response.body.length - 1; i++) {
          const current = new Date(response.body[i].createdAt).getTime();
          const next = new Date(response.body[i + 1].createdAt).getTime();
          expect(current).toBeGreaterThanOrEqual(next);
        }
      }
    });
  });

  describe("GET /api/v1/crises/:id", () => {
    let seededCrisisId: string;

    beforeAll(async () => {
      const crisis = await prisma.crisis.findFirst({
        where: { isActive: true },
      });
      if (crisis) {
        seededCrisisId = crisis.id;
      }
    });

    it("returns 200 with crisis details when found", async () => {
      if (!seededCrisisId) {
        const newCrisis = await prisma.crisis.create({
          data: {
            name: "E2E Test Crisis",
            type: CrisisType.EARTHQUAKE,
            country: "SY",
            startedAt: new Date("2026-01-01"),
          },
        });
        seededCrisisId = newCrisis.id;
      }

      const response = await request(app.getHttpServer()).get(
        `/api/v1/crises/${seededCrisisId}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(seededCrisisId);
      expect(response.body.name).toBeDefined();
      expect(response.body.type).toBeDefined();
      expect(response.body.country).toBeDefined();
      expect(response.body.startedAt).toBeDefined();
      expect(response.body.isActive).toBeDefined();
    });

    it("returns 404 when crisis not found", async () => {
      const response = await request(app.getHttpServer()).get(
        "/api/v1/crises/nonexistent-crisis-id",
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.CRISIS_NOT_FOUND);
    });
  });

  describe("GET /api/v1/crises/:id/footprints", () => {
    let crisisId: string;

    beforeAll(async () => {
      const crisis = await prisma.crisis.create({
        data: {
          name: "Footprints Crisis",
          type: CrisisType.EARTHQUAKE,
          country: "SY",
          startedAt: new Date("2026-01-01"),
          isActive: true,
        },
      });
      crisisId = crisis.id;
      cleanupCrisisIds.push(crisis.id);
    });

    it("returns 200 with a GeoJSON FeatureCollection", async () => {
      const response = await request(app.getHttpServer()).get(
        `/api/v1/crises/${crisisId}/footprints`,
      );

      expect(response.status).toBe(200);
      expect(response.body.type).toBe("FeatureCollection");
      expect(Array.isArray(response.body.features)).toBe(true);
    });

    it("returns 404 for unknown crisis id", async () => {
      const response = await request(app.getHttpServer()).get(
        "/api/v1/crises/missing-crisis/footprints",
      );

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.CRISIS_NOT_FOUND);
    });
  });

  describe("POST /api/v1/crises/:id/modular-schema", () => {
    let eqCrisisId: string;

    beforeAll(async () => {
      const crisis = await prisma.crisis.create({
        data: {
          name: "Modular Schema Crisis",
          type: CrisisType.EARTHQUAKE,
          country: "TR",
          startedAt: new Date("2026-01-01"),
          isActive: true,
        },
      });
      eqCrisisId = crisis.id;
      cleanupCrisisIds.push(crisis.id);
    });

    it("returns 200 with modular schema metadata", async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/crises/${eqCrisisId}/modular-schema`)
        .send({ infraType: "RESIDENTIAL" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.requiredCoreFields).toEqual(
        expect.arrayContaining(["infraType", "infraName", "crisisType"]),
      );
      expect(response.body.data.dynamicFields).toBeDefined();
    });

    it("includes labels and placeholders for all 6 UN languages", async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/crises/${eqCrisisId}/modular-schema`)
        .send({ infraType: "COMMERCIAL" });

      expect(response.status).toBe(200);

      const dynamicFields = response.body.data.dynamicFields as Record<
        string,
        {
          labels: Record<string, string>;
          placeholders: Record<string, string>;
        }
      >;
      const languages = ["ar", "zh", "en", "fr", "ru", "es"];

      Object.values(dynamicFields).forEach((field) => {
        languages.forEach((lang) => {
          expect(field.labels[lang]).toBeDefined();
          expect(field.placeholders[lang]).toBeDefined();
        });
      });
    });
  });

  describe("POST /api/v1/crises", () => {
    const validPayload = {
      name: "Test Crisis",
      type: "EARTHQUAKE",
      country: "SY",
      startedAt: new Date("2026-02-01").toISOString(),
    };

    afterEach(async () => {
      // Clean up created crises
      await prisma.crisis.deleteMany({
        where: { name: "Test Crisis" },
      });
    });

    it("returns 201 with created crisis for valid payload", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(validPayload);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.name).toBe("Test Crisis");
      expect(response.body.data.type).toBe("EARTHQUAKE");
      expect(response.body.data.country).toBe("SY");
    });

    it("returns 201 and includes isActive=true by default", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(validPayload);

      expect(response.status).toBe(201);
      expect(response.body.data.isActive).toBe(true);
    });

    it("returns 201 and includes region when provided", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ...validPayload,
          region: "Aleppo",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.region).toBe("Aleppo");
    });

    it("returns 201 and persists endedAt and description when provided", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ...validPayload,
          endedAt: new Date("2026-02-10").toISOString(),
          description: "Critical transport corridors are blocked by debris.",
        });

      expect(response.status).toBe(201);
      expect(response.body.data.endedAt).toBe("2026-02-10T00:00:00.000Z");
      expect(response.body.data.description).toBe(
        "Critical transport corridors are blocked by debris.",
      );
    });

    it("returns 400 when name is missing", async () => {
      const payloadWithoutName: Record<string, unknown> = { ...validPayload };
      delete payloadWithoutName.name;

      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payloadWithoutName);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.message).toContain("name");
    });

    it("returns 400 when type is missing", async () => {
      const payloadWithoutType: Record<string, unknown> = { ...validPayload };
      delete payloadWithoutType.type;

      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payloadWithoutType);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when type is invalid enum value", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ...validPayload,
          type: "INVALID_TYPE",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when country is missing", async () => {
      const payloadWithoutCountry: Record<string, unknown> = {
        ...validPayload,
      };
      delete payloadWithoutCountry.country;

      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payloadWithoutCountry);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when startedAt is missing", async () => {
      const payloadWithoutStartedAt: Record<string, unknown> = {
        ...validPayload,
      };
      delete payloadWithoutStartedAt.startedAt;

      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payloadWithoutStartedAt);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 400 when startedAt is not ISO datetime", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ...validPayload,
          startedAt: "invalid-date",
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 401 without bearer token", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .send(validPayload);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.UNAUTHORIZED);
    });

    it("returns 403 for non-admin role", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${viewerToken}`)
        .send(validPayload);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it("returns 201 and persists extentBBox when provided", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ...validPayload,
          extentBBox: [28.0, 38.0, 30.0, 40.0],
        });

      expect(response.status).toBe(201);
      expect(response.body.data.extentBBox).toEqual([28.0, 38.0, 30.0, 40.0]);
      const persisted = await prisma.crisis.findUnique({
        where: { id: response.body.data.id },
        select: {
          extentBBoxMinLng: true,
          extentBBoxMinLat: true,
          extentBBoxMaxLng: true,
          extentBBoxMaxLat: true,
        },
      });
      expect(persisted).toEqual({
        extentBBoxMinLng: 28,
        extentBBoxMinLat: 38,
        extentBBoxMaxLng: 30,
        extentBBoxMaxLat: 40,
      });
      cleanupCrisisIds.push(response.body.data.id);
    });

    it("returns footprints for crisis created with extentBBox", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ...validPayload,
          extentBBox: [28.0, 38.0, 30.0, 40.0],
        });
      expect(createResponse.status).toBe(201);
      const crisisId = createResponse.body.data.id;
      cleanupCrisisIds.push(crisisId);

      const footprintsResponse = await request(app.getHttpServer()).get(
        `/api/v1/crises/${crisisId}/footprints`,
      );
      expect(footprintsResponse.status).toBe(200);
      expect(footprintsResponse.body.type).toBe("FeatureCollection");
      expect(Array.isArray(footprintsResponse.body.features)).toBe(true);
    });

    it("uses extentBBox to return building footprints before any report exists", async () => {
      const footprintId = `bbox-building-${Date.now()}`;
      cleanupBuildingFootprintIds.push(footprintId);

      await prisma.$executeRawUnsafe(
        `INSERT INTO "building_footprint" ("id", "name", geom)
         VALUES ($1, $2, ST_GeomFromText($3, 4326))`,
        footprintId,
        "BBox Fallback Building",
        "POLYGON((28.20 38.20, 28.30 38.20, 28.30 38.30, 28.20 38.30, 28.20 38.20))",
      );

      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/crises")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ...validPayload,
          name: `BBox Proof Crisis ${Date.now()}`,
          extentBBox: [28.0, 38.0, 30.0, 40.0],
        });

      expect(createResponse.status).toBe(201);
      const crisisId = createResponse.body.data.id;
      cleanupCrisisIds.push(crisisId);

      const reportCount = await prisma.report.count({ where: { crisisId } });
      expect(reportCount).toBe(0);

      const footprintsResponse = await request(app.getHttpServer()).get(
        `/api/v1/crises/${crisisId}/footprints`,
      );

      expect(footprintsResponse.status).toBe(200);
      expect(footprintsResponse.body.type).toBe("FeatureCollection");
      expect(footprintsResponse.body.features).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: footprintId,
            properties: expect.objectContaining({
              name: "BBox Fallback Building",
            }),
          }),
        ]),
      );
    });

    it("returns 429 after admin crisis write rate limit is exceeded", async () => {
      const attempts = 101;
      const statuses: number[] = [];

      for (let i = 0; i < attempts; i++) {
        const response = await request(app.getHttpServer())
          .post("/api/v1/crises")
          .set("Authorization", `Bearer ${adminToken}`)
          .send({
            ...validPayload,
            name: `Rate Limit Crisis ${i + 1}`,
          });

        statuses.push(response.status);
      }

      expect(statuses).toContain(429);
    });
  });

  describe("PATCH /api/v1/crises/:id", () => {
    let testCrisisId: string;

    beforeAll(async () => {
      const crisis = await prisma.crisis.create({
        data: {
          name: "Crisis to Patch",
          type: CrisisType.EARTHQUAKE,
          country: "SY",
          startedAt: new Date("2026-01-01"),
          isActive: true,
        },
      });
      testCrisisId = crisis.id;
    });

    afterAll(async () => {
      await prisma.crisis.delete({ where: { id: testCrisisId } });
    });

    it("returns 200 with updated crisis when deactivating", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/crises/${testCrisisId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(testCrisisId);
      expect(response.body.data.isActive).toBe(false);
    });

    it("returns 200 when re-activating", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/crises/${testCrisisId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: true });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.isActive).toBe(true);
    });

    it("returns 200 with updated name", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/crises/${testCrisisId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Updated Crisis Name" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe("Updated Crisis Name");
    });

    it("returns 200 with updated region", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/crises/${testCrisisId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ region: "Idlib" });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.region).toBe("Idlib");
    });

    it("returns 200 with updated startedAt", async () => {
      const newDate = new Date("2026-03-15");
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/crises/${testCrisisId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ startedAt: newDate.toISOString() });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(new Date(response.body.data.startedAt).getTime()).toBe(
        newDate.getTime(),
      );
    });

    it("returns 200 with updated endedAt and description", async () => {
      const endDate = new Date("2026-03-20");
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/crises/${testCrisisId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          endedAt: endDate.toISOString(),
          description: "Bridge access remains limited.",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(new Date(response.body.data.endedAt).getTime()).toBe(
        endDate.getTime(),
      );
      expect(response.body.data.description).toBe(
        "Bridge access remains limited.",
      );
    });

    it("returns 404 when crisis not found", async () => {
      const response = await request(app.getHttpServer())
        .patch("/api/v1/crises/nonexistent-id")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("CRISIS_NOT_FOUND");
    });

    it("returns 400 when startedAt is invalid datetime", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/crises/${testCrisisId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ startedAt: "not-a-valid-date" });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("ignores immutable fields (type, country)", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/crises/${testCrisisId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          type: "FLOOD",
          country: "TR",
          isActive: true,
        });

      expect(response.status).toBe(200);
      // Type and country should remain unchanged
      const verifyResponse = await request(app.getHttpServer()).get(
        `/api/v1/crises/${testCrisisId}`,
      );
      expect(verifyResponse.body.type).toBe(CrisisType.EARTHQUAKE);
      expect(verifyResponse.body.country).toBe("SY");
    });

    it("returns 200 and updates extentBBox when patched", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/crises/${testCrisisId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ extentBBox: [36.0, 36.5, 37.5, 37.5] });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.extentBBox).toEqual([36.0, 36.5, 37.5, 37.5]);
      const persisted = await prisma.crisis.findUnique({
        where: { id: testCrisisId },
        select: {
          extentBBoxMinLng: true,
          extentBBoxMinLat: true,
          extentBBoxMaxLng: true,
          extentBBoxMaxLat: true,
        },
      });
      expect(persisted).toEqual({
        extentBBoxMinLng: 36,
        extentBBoxMinLat: 36.5,
        extentBBoxMaxLng: 37.5,
        extentBBoxMaxLat: 37.5,
      });
    });
  });

  describe("POST /api/v1/crises/modular-fields — admin configurable modular fields", () => {
    let crisisId: string;

    beforeAll(async () => {
      const crisis = await prisma.crisis.create({
        data: {
          name: "Modular Fields Admin Crisis",
          type: CrisisType.EARTHQUAKE,
          country: "TR",
          startedAt: new Date("2026-01-01"),
          isActive: true,
        },
      });
      crisisId = crisis.id;
      cleanupCrisisIds.push(crisis.id);
    });

    afterEach(async () => {
      await prisma.modularField.deleteMany({ where: { crisisId } });
    });

    it("returns 401 without bearer token", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises/modular-fields")
        .send({ crisisId, infraType: "RESIDENTIAL", fieldKey: "wall_type", fieldType: "string" });

      expect(response.status).toBe(401);
    });

    it("returns 403 for non-admin role", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises/modular-fields")
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ crisisId, infraType: "RESIDENTIAL", fieldKey: "wall_type", fieldType: "string" });

      expect(response.status).toBe(403);
    });

    it("returns 201 and creates a modular field definition", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/crises/modular-fields")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          crisisId,
          infraType: "RESIDENTIAL",
          fieldKey: "wall_type",
          fieldType: "string",
          required: false,
          labels: { en: "Wall type", fr: "Type de mur", ar: "نوع الجدار", zh: "墙类型", ru: "Тип стены", es: "Tipo de pared" },
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.fieldKey).toBe("wall_type");
      expect(response.body.data.crisisId).toBe(crisisId);
    });

    it("returns 400 for duplicate crisisId+infraType+fieldKey", async () => {
      const payload = {
        crisisId,
        infraType: "RESIDENTIAL",
        fieldKey: "dup_field",
        fieldType: "string",
      };

      const first = await request(app.getHttpServer())
        .post("/api/v1/crises/modular-fields")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payload);
      expect(first.status).toBe(201);

      const second = await request(app.getHttpServer())
        .post("/api/v1/crises/modular-fields")
        .set("Authorization", `Bearer ${adminToken}`)
        .send(payload);
      expect(second.status).toBe(409);
    });

    it("GET /api/v1/crises/modular-fields returns list for a crisis", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/crises/modular-fields")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ crisisId, infraType: "RESIDENTIAL", fieldKey: "roof_type", fieldType: "string" });

      const response = await request(app.getHttpServer())
        .get(`/api/v1/crises/modular-fields?crisisId=${crisisId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.some((f: { fieldKey: string }) => f.fieldKey === "roof_type")).toBe(true);
    });

    it("DELETE /api/v1/crises/modular-fields/:id returns 204 for admin", async () => {
      const createRes = await request(app.getHttpServer())
        .post("/api/v1/crises/modular-fields")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ crisisId, infraType: "RESIDENTIAL", fieldKey: "to_delete", fieldType: "string" });
      expect(createRes.status).toBe(201);
      const fieldId = createRes.body.data.id;

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/crises/modular-fields/${fieldId}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(deleteRes.status).toBe(204);
    });

    it("modular-schema endpoint returns DB-defined fields when present", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/crises/modular-fields")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          crisisId,
          infraType: "RESIDENTIAL",
          fieldKey: "custom_db_field",
          fieldType: "string",
          required: true,
          labels: { en: "Custom", fr: "Personnalisé", ar: "مخصص", zh: "自定义", ru: "Пользовательский", es: "Personalizado" },
        });

      const schemaRes = await request(app.getHttpServer())
        .post(`/api/v1/crises/${crisisId}/modular-schema`)
        .send({ infraType: "RESIDENTIAL" });

      expect(schemaRes.status).toBe(200);
      const fields = schemaRes.body.data.dynamicFields;
      expect(fields.custom_db_field).toBeDefined();
      expect(fields.custom_db_field.required).toBe(true);
    });
  });
});

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
