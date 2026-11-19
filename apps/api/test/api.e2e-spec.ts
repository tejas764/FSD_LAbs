import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";
import { configureApiDocs } from "../src/main";

describe("API e2e", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    configureApiDocs(app);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/health returns ok", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("GET /api/v1/openapi.json returns OpenAPI doc", async () => {
    const response = await request(app.getHttpServer()).get(
      "/api/v1/openapi.json",
    );

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.components?.schemas?.CreateReportMultipartDto).toEqual(
      expect.any(Object),
    );
    expect(response.body.components?.schemas?.CreateExportRequestDto).toEqual(
      expect.any(Object),
    );
    expect(response.body.components?.schemas?.ExportJobStatusDto).toEqual(
      expect.any(Object),
    );
  });

  it("loads ConfigService via @nestjs/config", () => {
    const configService = app.get(ConfigService);
    expect(configService).toBeDefined();
  });

  it("GET /api/docs serves Swagger UI", async () => {
    const response = await request(app.getHttpServer()).get("/api/docs");

    expect([200, 301, 302, 307, 308]).toContain(response.status);
  });
});
