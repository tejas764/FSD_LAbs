import { INestApplication } from "@nestjs/common";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { Queue } from "bullmq";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

jest.setTimeout(30000);

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7sAAAAASUVORK5CYII=",
  "base64",
);

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

function submitReport(
  app: INestApplication,
  crisisId: string,
  reporterId: string,
  index = 0,
) {
  return request(app.getHttpServer())
    .post("/api/v1/reports")
    .field("crisisId", crisisId)
    .field("damageLevel", "PARTIAL")
    .field("infraType", "RESIDENTIAL")
    .field("infraName", `Reporter test building ${index}`)
    .field("crisisType", "EARTHQUAKE")
    .field("hasDebris", "false")
    .field("collectedAt", new Date().toISOString())
    .field("description", "Reporter badge test submission")
    .field("electricityCondition", "SEVERE_DAMAGE")
    .field("healthServicesFunctioning", "PARTIALLY_FUNCTIONAL")
    .field("pressingNeeds", JSON.stringify(["FOOD_WATER"]))
    .field("latitude", String(36.2 + index * 0.001))
    .field("longitude", String(36.16 + index * 0.001))
    .field("reporterId", reporterId)
    .attach("photo", onePixelPng, {
      filename: "photo.png",
      contentType: "image/png",
    });
}

describe("Reporter profile e2e", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let crisisId: string;
  let aiQueue: Queue;
  let translationQueue: Queue;

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
        name: "Reporter Badge E2E Crisis",
        type: "EARTHQUAKE",
        country: "Syria",
        startedAt: new Date("2026-01-01"),
      },
    });
    crisisId = crisis.id;
  });

  afterAll(async () => {
    await aiQueue.drain(true);
    await translationQueue.drain(true);

    const reportIds = await prisma.report.findMany({
      where: { crisisId },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: { reportId: { in: reportIds.map((r) => r.id) } },
    });
    await prisma.report.deleteMany({ where: { crisisId } });
    await prisma.crisis.delete({ where: { id: crisisId } });
    // Clean up reporter profile
    await prisma.reporterProfile.deleteMany({
      where: { reporterId: { startsWith: "e2e-badge-reporter-" } },
    });
    await app.close();
  });

  it("GET /api/v1/reporter/profile returns 400 when reporterId is missing", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/v1/reporter/profile",
    );

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });

  it("GET /api/v1/reporter/profile returns 404 when reporterId is unknown", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/v1/reporter/profile?reporterId=no-such-reporter",
    );

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
  });

  it("submitting a report with reporterId creates a profile with count=1 and NEWCOMER badge", async () => {
    const reporterId = "e2e-badge-reporter-1";

    const submitResponse = await submitReport(app, crisisId, reporterId, 0);
    expect(submitResponse.status).toBe(201);

    const profileResponse = await request(app.getHttpServer()).get(
      `/api/v1/reporter/profile?reporterId=${reporterId}`,
    );

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.success).toBe(true);
    expect(profileResponse.body.data.reporterId).toBe(reporterId);
    expect(profileResponse.body.data.reportCount).toBe(1);
    expect(profileResponse.body.data.badgeLevel).toBe("NEWCOMER");
    expect(typeof profileResponse.body.data.lastActiveAt).toBe("string");
  });

  it("submitting 5 reports upgrades badge to CONTRIBUTOR", async () => {
    const reporterId = "e2e-badge-reporter-2";

    for (let i = 0; i < 5; i++) {
      const res = await submitReport(app, crisisId, reporterId, 10 + i);
      expect(res.status).toBe(201);
    }

    const profileResponse = await request(app.getHttpServer()).get(
      `/api/v1/reporter/profile?reporterId=${reporterId}`,
    );

    expect(profileResponse.status).toBe(200);
    expect(profileResponse.body.data.reportCount).toBe(5);
    expect(profileResponse.body.data.badgeLevel).toBe("CONTRIBUTOR");
  });
});
