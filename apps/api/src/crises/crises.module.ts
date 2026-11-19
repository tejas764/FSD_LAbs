import { Module } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CrisesController } from "./crises.controller";
import { CrisesService } from "./crises.service";
import { CrisisCacheService } from "./crisis-cache.service";
import { FootprintsSourceService } from "./footprints-source.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";

@Module({
  controllers: [CrisesController],
  providers: [
    CrisesService,
    CrisisCacheService,
    FootprintsSourceService,
    JwtAuthGuard,
    RolesGuard,
    Reflector,
  ],
})
export class CrisesModule {}
