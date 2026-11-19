import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { PrismaModule } from "./prisma/prisma.module";
import { PrismaService } from "./prisma/prisma.service";
import { HealthController } from "./health/health.controller";
import { RealtimeFeedModule } from "./reports/realtime-feed.module";
import { ReportsModule } from "./reports/reports.module";
import { CrisesModule } from "./crises/crises.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { ReporterModule } from "./reporter/reporter.module";
import { AccountModule } from "./account/account.module";
import { SetupModule } from "./setup/setup.module";
import { FieldMessagesModule } from "./field-messages/field-messages.module";
import { VolunteersModule } from "./volunteers/volunteers.module";
import { createBetterAuth } from "./auth/better-auth";
import { resolveMailerConfig } from "./auth/mailer-config";
import { API_ENV_FILE_PATHS } from "./config/env-file-paths";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: API_ENV_FILE_PATHS,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: configService.get<number>(
              "RATE_LIMIT_ADMIN_EXPORT_PER_MINUTE",
              30,
            ),
          },
          {
            name: "crisis-write",
            ttl: 60_000,
            limit: configService.get<number>(
              "RATE_LIMIT_ADMIN_CRISIS_WRITE_PER_MINUTE",
              30,
            ),
          },
        ],
      }),
    }),
    // Mount better-auth at /api/v1/auth (matches frontend proxy in apps/web/lib/auth.ts).
    // disableGlobalAuthGuard must be at options level (not inside factory) — forRootAsync
    // reads it from the options object, not the factory return value.
    AuthModule.forRootAsync({
      isGlobal: true,
      disableGlobalAuthGuard: true,
      inject: [ConfigService, PrismaService],
      useFactory: (configService: ConfigService, prisma: PrismaService) => ({
        auth: createBetterAuth(
          prisma,
          configService.get<string>("BETTER_AUTH_SECRET", "change-me") ??
            "change-me",
          configService.get<string>("BETTER_AUTH_URL"),
          configService.get<string>("CORS_ORIGINS"),
          configService.get<string>("BETTER_AUTH_API_URL"),
          resolveMailerConfig(configService),
        ),
      }),
    }),
    PrismaModule,
    RealtimeFeedModule,
    ReportsModule,
    CrisesModule,
    AnalyticsModule,
    ReporterModule,
    AccountModule,
    SetupModule,
    FieldMessagesModule,
    VolunteersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
