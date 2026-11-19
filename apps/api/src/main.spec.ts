import type { INestApplication } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { Test, type TestingModule } from "@nestjs/testing";

jest.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class MockAuthGuard {
    canActivate() {
      return true;
    }
  },
  OptionalAuth: () => () => undefined,
}));

import {
  buildOpenApiDocument,
  configureApiDocs,
  configureSecurity,
} from "./main-utils";
import { SwaggerModule } from "@nestjs/swagger";
import { DamageLevel, InfraType, CrisisType } from "@prisma/client";
import { ThrottlerGuard } from "@nestjs/throttler";
import { ReportsController } from "./reports/reports.controller";
import { CrisesController } from "./crises/crises.controller";
import { AnalyticsController } from "./analytics/analytics.controller";
import { ReporterController } from "./reporter/reporter.controller";
import { ReportsService } from "./reports/reports.service";
import { RealtimeFeedService } from "./reports/realtime-feed.service";
import { CrisesService } from "./crises/crises.service";
import { AnalyticsService } from "./analytics/analytics.service";
import { ReporterService } from "./reporter/reporter.service";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RolesGuard } from "./auth/roles.guard";
import { ReportSubmitThrottlerGuard } from "./reports/report-submit-throttler.guard";

function getJsonResponseSchema(
  doc: ReturnType<typeof buildOpenApiDocument>,
  path: string,
  method: "get" | "post" | "patch" | "delete",
  status: string,
) {
  const response = doc.paths?.[path]?.[method]?.responses?.[status] as
    | {
        content?: {
          "application/json"?: {
            schema?: unknown;
          };
        };
      }
    | undefined;

  return response?.content?.["application/json"]?.schema;
}

describe("configureSecurity", () => {
  it("enables CORS with configured origins and credentials", () => {
    const enableCors = jest.fn();
    const use = jest.fn();
    const app = {
      enableCors,
      use,
    } as unknown as INestApplication;

    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) => {
          if (key === "CORS_ORIGINS") {
            return "http://localhost:3000,https://crisismap.example.com";
          }
          return defaultValue;
        }),
    } as unknown as ConfigService;

    configureSecurity(app, configService);

    expect(enableCors).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: ["http://localhost:3000", "https://crisismap.example.com"],
        credentials: true,
      }),
    );
  });

  it("registers helmet middleware", () => {
    const enableCors = jest.fn();
    const use = jest.fn();
    const app = {
      enableCors,
      use,
    } as unknown as INestApplication;

    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    configureSecurity(app, configService);

    expect(use).toHaveBeenCalled();
  });

  it("sets express trust proxy when TRUST_PROXY is configured", () => {
    const set = jest.fn();
    const app = {
      enableCors: jest.fn(),
      use: jest.fn(),
      getHttpAdapter: () => ({
        getInstance: () => ({ set }),
      }),
    } as unknown as INestApplication;

    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) => {
          if (key === "TRUST_PROXY") {
            return "1";
          }
          return defaultValue;
        }),
    } as unknown as ConfigService;

    configureSecurity(app, configService);

    expect(set).toHaveBeenCalledWith("trust proxy", 1);
  });

  it("does not set trust proxy when TRUST_PROXY is empty", () => {
    const set = jest.fn();
    const app = {
      enableCors: jest.fn(),
      use: jest.fn(),
      getHttpAdapter: () => ({
        getInstance: () => ({ set }),
      }),
    } as unknown as INestApplication;

    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) => {
          if (key === "TRUST_PROXY") {
            return "";
          }
          return defaultValue;
        }),
    } as unknown as ConfigService;

    configureSecurity(app, configService);

    expect(set).not.toHaveBeenCalled();
  });
});
describe("OpenAPI contract — enum parity with Prisma schema", () => {
  let doc: ReturnType<typeof buildOpenApiDocument>;
  let schemaProps: Record<string, { enum?: string[] }> = {};
  let app: INestApplication | undefined;
  let moduleRef: TestingModule | undefined;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      controllers: [
        ReportsController,
        CrisesController,
        AnalyticsController,
        ReporterController,
      ],
      providers: [
        { provide: ReportsService, useValue: {} },
        { provide: RealtimeFeedService, useValue: {} },
        { provide: CrisesService, useValue: {} },
        { provide: AnalyticsService, useValue: {} },
        { provide: ReporterService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ReportSubmitThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    doc = buildOpenApiDocument(app);
    schemaProps =
      (
        doc.components?.schemas?.["CreateReportMultipartDto"] as
          | { properties?: Record<string, { enum?: string[] }> }
          | undefined
      )?.properties ?? {};
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  it("damageLevel enum matches Prisma DamageLevel — MINIMAL, PARTIAL, COMPLETE", () => {
    expect(schemaProps["damageLevel"]?.enum).toEqual(
      Object.values(DamageLevel),
    );
    expect(schemaProps["damageLevel"]?.enum).not.toContain("NONE");
    expect(schemaProps["damageLevel"]?.enum).not.toContain("UNKNOWN");
  });

  it("infraType enum matches Prisma InfraType — includes TRANSPORT_COMMUNICATION and UTILITY, not ROADS or POWER", () => {
    expect(schemaProps["infraType"]?.enum).toEqual(Object.values(InfraType));
    expect(schemaProps["infraType"]?.enum).toContain("TRANSPORT_COMMUNICATION");
    expect(schemaProps["infraType"]?.enum).toContain("UTILITY");
    expect(schemaProps["infraType"]?.enum).not.toContain("ROADS");
    expect(schemaProps["infraType"]?.enum).not.toContain("POWER");
  });

  it("crisisType enum matches Prisma CrisisType — includes HURRICANE_CYCLONE, not CYCLONE", () => {
    expect(schemaProps["crisisType"]?.enum).toEqual(Object.values(CrisisType));
    expect(schemaProps["crisisType"]?.enum).toContain("HURRICANE_CYCLONE");
    expect(schemaProps["crisisType"]?.enum).not.toContain("CYCLONE");
  });

  it("documents explicit report detail, history, and map-feed response schemas", () => {
    expect(doc.components?.schemas?.["ReportDetailResponseDto"]).toEqual(
      expect.any(Object),
    );
    expect(doc.components?.schemas?.["ReportHistoryResponseDto"]).toEqual(
      expect.any(Object),
    );
    expect(doc.components?.schemas?.["ReportGeoJsonFeatureCollectionDto"]).toEqual(
      expect.any(Object),
    );

    expect(
      getJsonResponseSchema(doc, "/api/v1/reports/{id}", "get", "200"),
    ).toEqual({
      $ref: "#/components/schemas/ReportDetailResponseDto",
    });

    expect(
      getJsonResponseSchema(
        doc,
        "/api/v1/reports/{id}/history",
        "get",
        "200",
      ),
    ).toEqual({
      $ref: "#/components/schemas/ReportHistoryResponseDto",
    });

    expect(
      getJsonResponseSchema(doc, "/api/v1/reports", "get", "200"),
    ).toEqual({
      $ref: "#/components/schemas/ReportGeoJsonFeatureCollectionDto",
    });
  });

  it("documents explicit crisis detail, list, and footprint response schemas", () => {
    expect(doc.components?.schemas?.["CrisisDto"]).toEqual(expect.any(Object));
    expect(
      doc.components?.schemas?.["CrisisFootprintFeatureCollectionDto"],
    ).toEqual(expect.any(Object));

    expect(
      getJsonResponseSchema(doc, "/api/v1/crises", "get", "200"),
    ).toEqual({
      type: "array",
      items: { $ref: "#/components/schemas/CrisisDto" },
    });

    expect(
      getJsonResponseSchema(doc, "/api/v1/crises/{id}", "get", "200"),
    ).toEqual({
      $ref: "#/components/schemas/CrisisDto",
    });

    expect(
      getJsonResponseSchema(
        doc,
        "/api/v1/crises/{id}/footprints",
        "get",
        "200",
      ),
    ).toEqual({
      $ref: "#/components/schemas/CrisisFootprintFeatureCollectionDto",
    });
  });

  it("documents translated descriptions explicitly in report detail extraFields", () => {
    const extraFields = (
      doc.components?.schemas?.["ReportDetailDataDto"] as
        | {
            properties?: {
              extraFields?: {
                properties?: {
                  translations?: {
                    additionalProperties?: { type?: string };
                  };
                };
              };
            };
          }
        | undefined
    )?.properties?.extraFields;

    expect(extraFields).toEqual(expect.any(Object));
    expect(extraFields?.properties?.translations).toEqual(
      expect.objectContaining({
        type: "object",
        additionalProperties: { type: "string" },
      }),
    );
  });

  it("documents extentBBox as [minLng, minLat, maxLng, maxLat] in crisis responses", () => {
    const crisisSchema = doc.components?.schemas?.["CrisisDto"] as
      | {
          properties?: {
            extentBBox?: {
              type?: string;
              minItems?: number;
              maxItems?: number;
              items?: { type?: string };
              description?: string;
            };
          };
        }
      | undefined;

    expect(crisisSchema?.properties?.extentBBox).toEqual(
      expect.objectContaining({
        type: "array",
        minItems: 4,
        maxItems: 4,
        items: { type: "number" },
        description: expect.stringContaining("minLng, minLat, maxLng, maxLat"),
      }),
    );
  });

  it("documents explicit analytics and reporter response schemas", () => {
    expect(doc.components?.schemas?.["HotspotResponseDto"]).toEqual(
      expect.any(Object),
    );
    expect(doc.components?.schemas?.["ReporterProfileResponseDto"]).toEqual(
      expect.any(Object),
    );

    expect(
      getJsonResponseSchema(doc, "/api/v1/analytics/hotspots", "get", "200"),
    ).toEqual({
      $ref: "#/components/schemas/HotspotResponseDto",
    });

    expect(
      getJsonResponseSchema(doc, "/api/v1/reporter/profile", "get", "200"),
    ).toEqual({
      $ref: "#/components/schemas/ReporterProfileResponseDto",
    });
  });

  it("documents explicit response schemas for remaining success payloads", () => {
    expect(
      getJsonResponseSchema(doc, "/api/v1/reports", "post", "201"),
    ).toEqual({
      $ref: "#/components/schemas/SubmitReportResponseDto",
    });

    expect(
      getJsonResponseSchema(doc, "/api/v1/reports", "post", "200"),
    ).toEqual({
      $ref: "#/components/schemas/SubmitReportResponseDto",
    });

    expect(
      getJsonResponseSchema(doc, "/api/v1/reports/{id}/anonymize", "post", "200"),
    ).toEqual({
      $ref: "#/components/schemas/ReportAnonymizeResponseDto",
    });

    expect(
      getJsonResponseSchema(doc, "/api/v1/reports/{id}", "patch", "200"),
    ).toEqual({
      $ref: "#/components/schemas/ReportModerationResponseDto",
    });

    expect(
      getJsonResponseSchema(doc, "/api/v1/crises/modular-fields", "post", "201"),
    ).toEqual({
      $ref: "#/components/schemas/ModularFieldMutationResponseDto",
    });

    expect(
      getJsonResponseSchema(doc, "/api/v1/crises/modular-fields", "get", "200"),
    ).toEqual({
      $ref: "#/components/schemas/ModularFieldListResponseDto",
    });

    expect(
      getJsonResponseSchema(doc, "/api/v1/crises/{id}/modular-schema", "post", "200"),
    ).toEqual({
      $ref: "#/components/schemas/ModularSchemaResponseDto",
    });
  });

  it("documents success flags as booleans in explicit response schemas", () => {
    const schemaNames = [
      "HotspotResponseDto",
      "ReporterProfileResponseDto",
      "ReportHistoryResponseDto",
      "ReportDetailResponseDto",
      "SubmitReportResponseDto",
      "ReportAnonymizeResponseDto",
      "ReportModerationResponseDto",
      "CrisisMutationResponseDto",
      "ModularFieldMutationResponseDto",
      "ModularFieldListResponseDto",
      "ModularSchemaResponseDto",
    ];

    for (const schemaName of schemaNames) {
      const schema = doc.components?.schemas?.[schemaName] as
        | {
            properties?: {
              success?: {
                type?: string;
              };
            };
          }
        | undefined;

      expect(schema?.properties?.success).toEqual(
        expect.objectContaining({ type: "boolean" }),
      );
    }
  });
});
describe("configureApiDocs", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("registers bearer auth scheme and default servers", () => {
    const createDocument = jest
      .spyOn(SwaggerModule, "createDocument")
      .mockReturnValue({
        openapi: "3.0.0",
        info: { description: "" },
      } as never);
    const setup = jest.spyOn(SwaggerModule, "setup").mockImplementation();

    const get = jest.fn();
    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({ get }),
      }),
    } as unknown as INestApplication;

    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) =>
          key === "BETTER_AUTH_SECRET" ? "change-me" : defaultValue,
        ),
    } as unknown as ConfigService;

    configureApiDocs(app, configService);

    expect(createDocument).toHaveBeenCalledWith(
      app,
      expect.objectContaining({
        components: expect.objectContaining({
          securitySchemes: expect.objectContaining({
            bearerAuth: expect.any(Object),
          }),
        }),
        servers: expect.arrayContaining([
          expect.objectContaining({
            url: "/",
            description: "Current host (recommended)",
          }),
          expect.objectContaining({
            url: "http://localhost:4000",
            description: "Localhost direct",
          }),
        ]),
      }),
    );
    expect(setup).toHaveBeenCalled();
  });

  it("adds configured API public URL server when provided", () => {
    const createDocument = jest
      .spyOn(SwaggerModule, "createDocument")
      .mockReturnValue({
        openapi: "3.0.0",
        info: { description: "" },
      } as never);
    jest.spyOn(SwaggerModule, "setup").mockImplementation();

    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({ get: jest.fn() }),
      }),
    } as unknown as INestApplication;

    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: string) => {
          if (key === "API_PUBLIC_URL") {
            return "https://api.crisismap.example";
          }
          if (key === "BETTER_AUTH_SECRET") {
            return "change-me";
          }
          return defaultValue;
        }),
    } as unknown as ConfigService;

    configureApiDocs(app, configService);

    expect(createDocument).toHaveBeenCalledWith(
      app,
      expect.objectContaining({
        servers: expect.arrayContaining([
          expect.objectContaining({
            url: "https://api.crisismap.example",
          }),
        ]),
      }),
    );
  });
});
