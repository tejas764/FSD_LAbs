import "reflect-metadata";

import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { HttpLoggerInterceptor } from "./common/http-logger.interceptor";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import {
  configureSecurity,
  configureApiDocs,
  buildOpenApiDocument,
} from "./main-utils";

export { configureSecurity, configureApiDocs, buildOpenApiDocument };

async function bootstrap() {
  // bodyParser: false is required by @thallesp/nestjs-better-auth — the AuthModule
  // re-adds body parsers for non-auth routes automatically.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const logger = new Logger("Bootstrap");

  app.setGlobalPrefix("api/v1");
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new HttpLoggerInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

  const configService = app.get(ConfigService);
  configureSecurity(app, configService);

  configureApiDocs(app, configService);

  const port = configService.get<number>("API_PORT") ?? 4000;
  await app.listen(port);
  logger.log(`API listening on http://localhost:${port}`);
}

if (require.main === module) {
  void bootstrap();
}
