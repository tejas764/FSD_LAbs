import { Module } from "@nestjs/common";
import { ReporterController } from "./reporter.controller";
import { ReporterService } from "./reporter.service";

@Module({
  controllers: [ReporterController],
  providers: [ReporterService],
  exports: [ReporterService],
})
export class ReporterModule {}
