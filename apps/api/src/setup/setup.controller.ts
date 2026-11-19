import {
  Controller,
  Post,
  Headers,
  ForbiddenException,
  HttpCode,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { seedLocalTestData } from "../prisma/seed-data";

@ApiTags("setup")
@Controller("setup")
export class SetupController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Idempotent seed endpoint — safe to call multiple times.
   * Requires `Authorization: Bearer <SEED_SECRET>` where SEED_SECRET is set
   * as an environment variable. Returns 403 if the secret is missing or wrong.
   *
   * Usage:
   *   curl -X POST https://<api-host>/api/v1/setup/seed \
   *     -H "Authorization: Bearer <your-seed-secret>"
   */
  @Post("seed")
  @HttpCode(200)
  @ApiOperation({ summary: "Seed database with initial data" })
  @ApiHeader({
    name: "authorization",
    description: "Bearer <SEED_SECRET>",
    required: true,
  })
  @ApiResponse({ status: 200, description: "Seed completed" })
  @ApiResponse({ status: 403, description: "Missing or invalid SEED_SECRET" })
  async seed(@Headers("authorization") auth: string | undefined) {
    const secret = this.config.get<string>("SEED_SECRET");
    if (!secret || !auth || auth !== `Bearer ${secret}`) {
      throw new ForbiddenException("Missing or invalid SEED_SECRET");
    }
    await seedLocalTestData(this.prisma);
    return { ok: true, message: "Database seeded successfully" };
  }
}
