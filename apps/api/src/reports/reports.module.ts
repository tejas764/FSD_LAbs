import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PhotoProcessingService } from "./photo-processing.service";
import { ReportStorageService } from "./report-storage.service";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { QueueModule } from "../queue/queue.module";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ReportSubmitThrottlerGuard } from "./report-submit-throttler.guard";
import { ReporterModule } from "../reporter/reporter.module";

@Module({
  imports: [QueueModule, ReporterModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    PhotoProcessingService,
    ReportStorageService,
    ReportSubmitThrottlerGuard,
    JwtAuthGuard,
    RolesGuard,
    Reflector,
  ],
})
export class ReportsModule {}
