import type { INestApplication } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import * as jwt from "jsonwebtoken";

export function configureSecurity(
  app: INestApplication,
  configService: ConfigService,
): void {
  const trustProxyRaw = configService.get<string>("TRUST_PROXY", "") ?? "";
  const trustProxyValue = trustProxyRaw.trim();

  if (trustProxyValue.length > 0) {
    const adapter = app.getHttpAdapter().getInstance() as {
      set?: (key: string, value: unknown) => void;
    };

    if (typeof adapter.set === "function") {
      const asNumber = Number(trustProxyValue);
      adapter.set(
        "trust proxy",
        Number.isFinite(asNumber) ? asNumber : trustProxyValue,
      );
    }
  }

  const configuredOrigins = configService.get<string>("CORS_ORIGINS", "") ?? "";
  const origins = configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  app.enableCors({
    origin: origins.length > 0 ? origins : ["http://localhost:3000"],
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
}

export function buildOpenApiDocument(
  app: INestApplication,
  configService?: ConfigService,
): ReturnType<typeof SwaggerModule.createDocument> {
  const apiPublicUrl =
    configService?.get<string>("API_PUBLIC_URL", "")?.trim() ?? "";
  const isProd = apiPublicUrl.length > 0;

  const builder = new DocumentBuilder()
    .setTitle("CrisisMap API")
    .setDescription("Crisis damage reporting API for UNDP field operations.")
    .setVersion("1.0.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        in: "header",
      },
      "bearerAuth",
    )
    // "/" makes Swagger UI call relative to whatever host it's served from.
    // This works in GitHub Codespaces, local dev, and any tunnel/proxy.
    .addServer("/", "Current host (recommended)")
    .addServer("http://localhost:4000", "Localhost direct");

  if (isProd) {
    builder.addServer(`${apiPublicUrl.replace(/\/$/, "")}`, "Production");
  }

  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);
  // Align runtime OpenAPI output with canonical contract version (docs/openapi.yaml).
  document.openapi = "3.1.0";
  return document;
}

export function configureApiDocs(
  app: INestApplication,
  configService?: ConfigService,
): void {
  const nodeEnv =
    configService?.get<string>("NODE_ENV", "development") ?? "development";
  const devDescription =
    nodeEnv !== "production"
      ? " On the **Development** server, the admin Bearer token is pre-filled — click **Authorize** to apply it."
      : "";

  const document = buildOpenApiDocument(app, configService);
  // Append env-specific description note (not included in exported spec).
  (document.info as { description: string }).description += devDescription;

  const swaggerOptions: Record<string, unknown> = {
    persistAuthorization: true,
  };

  // In non-production environments, pre-fill a dev admin token so Swagger UI
  // works out-of-the-box without manual token generation.
  if (nodeEnv !== "production") {
    const secret =
      configService?.get<string>("BETTER_AUTH_SECRET", "change-me") ??
      "change-me";
    const adminToken = jwt.sign({ sub: "dev-admin", role: "admin" }, secret, {
      algorithm: "HS256",
      expiresIn: "24h",
    });

    // Pre-fill admin token so clicking "Authorize" in Swagger UI works immediately.
    swaggerOptions.authAction = {
      bearerAuth: {
        name: "bearerAuth",
        schema: {
          type: "http",
          in: "header",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        value: adminToken,
      },
    };
  }

  SwaggerModule.setup("api/docs", app, document, { swaggerOptions });

  const adapter = app.getHttpAdapter().getInstance();
  adapter.get(
    "/api/v1/openapi.json",
    (_req: unknown, res: { json: (body: unknown) => void }) => {
      res.json(document);
    },
  );
  adapter.get(
    "/api/v1/openapi",
    (
      _req: unknown,
      res: { redirect: (status: number, location: string) => void },
    ) => {
      res.redirect(308, "/api/v1/openapi.json");
    },
  );
}
