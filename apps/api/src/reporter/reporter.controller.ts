import { Controller, Get, Inject, Query, Res } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { ErrorCode } from "../common/error-codes";
import { ReporterService } from "./reporter.service";

class ReporterProfileDataDto {
  @ApiProperty({ type: String })
  reporterId!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  reportCount!: number;

  @ApiProperty({ type: String })
  badgeLevel!: string;

  @ApiProperty({ type: String, format: "date-time" })
  lastActiveAt!: string;
}

class ReporterProfileResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: ReporterProfileDataDto })
  data!: ReporterProfileDataDto;
}

@ApiTags("reporter")
@ApiExtraModels(ReporterProfileDataDto, ReporterProfileResponseDto)
@Controller("reporter")
export class ReporterController {
  constructor(
    @Inject(ReporterService)
    private readonly reporterService: ReporterService,
  ) {}

  @Get("profile")
  @ApiOperation({ summary: "Get reporter badge profile (no PII)" })
  @ApiQuery({ name: "reporterId", type: String, required: true })
  @ApiOkResponse({ type: ReporterProfileResponseDto })
  @ApiBadRequestResponse({ description: "reporterId query param is required" })
  @ApiNotFoundResponse({ description: "No profile found for reporterId" })
  async getProfile(
    @Query("reporterId") reporterId: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!reporterId) {
      response.status(400);
      return {
        success: false,
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "reporterId is required",
        },
      };
    }

    const result = await this.reporterService.getProfile(reporterId);

    if (!result.found) {
      response.status(404);
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `No profile found for reporterId "${reporterId}"`,
        },
      };
    }

    return {
      success: true,
      data: result.profile,
    };
  }
}
