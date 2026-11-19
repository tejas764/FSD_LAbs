import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import type { Response } from "express";
import { CrisisType, InfraType } from "@prisma/client";
import { CrisesService } from "./crises.service";
import { UseGuards } from "@nestjs/common";
import { AuthGuard } from "@thallesp/nestjs-better-auth";
import { RolesGuard } from "../auth/roles.guard";
import { Roles, Role } from "../auth/roles.decorator";
import { SkipThrottle, ThrottlerGuard } from "@nestjs/throttler";

class CrisisDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ enum: Object.values(CrisisType) })
  type!: CrisisType;

  @ApiProperty({ type: String })
  country!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  region!: string | null;

  @ApiProperty({ type: String, format: "date-time" })
  startedAt!: string;

  @ApiPropertyOptional({ type: String, format: "date-time", nullable: true })
  endedAt!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({
    type: [Number],
    minItems: 4,
    maxItems: 4,
    nullable: true,
    description:
      "Bounding box [minLng, minLat, maxLng, maxLat] (WGS-84) used for footprint lookup",
  })
  extentBBox!: [number, number, number, number] | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;

  @ApiProperty({ type: String, format: "date-time" })
  updatedAt!: string;
}

class CrisisMutationResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: CrisisDto })
  data!: CrisisDto;
}

class ModularFieldDto {
  @ApiProperty({ type: String, format: "uuid" })
  id!: string;

  @ApiProperty({ type: String, format: "uuid" })
  crisisId!: string;

  @ApiProperty({ enum: Object.values(InfraType) })
  infraType!: InfraType;

  @ApiProperty({ type: String })
  fieldKey!: string;

  @ApiProperty({ enum: ["string", "number", "boolean"] })
  fieldType!: string;

  @ApiProperty({ type: Boolean })
  required!: boolean;

  @ApiPropertyOptional({
    type: "object",
    nullable: true,
    additionalProperties: { type: "string" },
  })
  labels!: Record<string, string> | null;

  @ApiProperty({ type: String, format: "date-time" })
  createdAt!: string;
}

class ModularFieldMutationResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: ModularFieldDto })
  data!: ModularFieldDto;
}

class ModularFieldListResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: [ModularFieldDto] })
  data!: ModularFieldDto[];
}

class ModularSchemaDataDto {
  @ApiProperty({ enum: Object.values(CrisisType) })
  crisisType!: CrisisType;

  @ApiProperty({ enum: Object.values(InfraType) })
  infraType!: InfraType;

  @ApiProperty({ type: [String] })
  requiredCoreFields!: string[];

  @ApiProperty({
    type: "object",
    additionalProperties: {
      type: "object",
      properties: {
        key: { type: "string" },
        type: { type: "string", enum: ["string", "number", "boolean"] },
        required: { type: "boolean" },
        labels: {
          type: "object",
          additionalProperties: { type: "string" },
        },
        placeholders: {
          type: "object",
          additionalProperties: { type: "string" },
        },
      },
      required: ["key", "type", "required", "labels", "placeholders"],
    },
  })
  dynamicFields!: Record<string, unknown>;
}

class ModularSchemaResponseDto {
  @ApiProperty({ type: Boolean, example: true })
  success!: boolean;

  @ApiProperty({ type: ModularSchemaDataDto })
  data!: ModularSchemaDataDto;
}

class CrisisFootprintFeaturePropertiesDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  name!: string | null;
}

class CrisisFootprintGeometryDto {
  @ApiProperty({ enum: ["Polygon", "MultiPolygon"] })
  type!: "Polygon" | "MultiPolygon";

  @ApiProperty({
    type: "array",
    items: {
      type: "array",
      items: { type: "array", items: { type: "number" } },
    },
  })
  coordinates!: unknown[];
}

class CrisisFootprintFeatureDto {
  @ApiProperty({ enum: ["Feature"] })
  type!: "Feature";

  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: CrisisFootprintGeometryDto })
  geometry!: CrisisFootprintGeometryDto;

  @ApiProperty({ type: CrisisFootprintFeaturePropertiesDto })
  properties!: CrisisFootprintFeaturePropertiesDto;
}

class CrisisFootprintMetadataDto {
  @ApiPropertyOptional({ type: String })
  source?: string;

  @ApiPropertyOptional({ type: String })
  reason?: string;
}

class CrisisFootprintFeatureCollectionDto {
  @ApiProperty({ enum: ["FeatureCollection"] })
  type!: "FeatureCollection";

  @ApiProperty({ type: [CrisisFootprintFeatureDto] })
  features!: CrisisFootprintFeatureDto[];

  @ApiPropertyOptional({ type: CrisisFootprintMetadataDto })
  metadata?: CrisisFootprintMetadataDto;
}

@ApiTags("crises")
@ApiExtraModels(
  CrisisDto,
  CrisisMutationResponseDto,
  ModularFieldDto,
  ModularFieldMutationResponseDto,
  ModularFieldListResponseDto,
  ModularSchemaDataDto,
  ModularSchemaResponseDto,
  CrisisFootprintFeaturePropertiesDto,
  CrisisFootprintGeometryDto,
  CrisisFootprintFeatureDto,
  CrisisFootprintMetadataDto,
  CrisisFootprintFeatureCollectionDto,
)
@Controller("crises")
export class CrisesController {
  constructor(
    @Inject(CrisesService) private readonly crisesService: CrisesService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List all crises" })
  @ApiQuery({
    name: "active",
    required: false,
    type: Boolean,
    description: "Filter by active status",
  })
  @ApiQuery({ name: "q", required: false, type: String, description: "Search by name (case-insensitive)" })
  @ApiQuery({ name: "country", required: false, type: String, description: "Filter by country code" })
  @ApiQuery({ name: "take", required: false, type: Number, description: "Max results (default 50, max 50)" })
  @ApiQuery({ name: "lat", required: false, type: Number, description: "Reporter latitude — filters to crises whose bbox contains this point" })
  @ApiQuery({ name: "lng", required: false, type: Number, description: "Reporter longitude — filters to crises whose bbox contains this point" })
  @ApiOkResponse({ type: CrisisDto, isArray: true })
  async listCrises(
    @Query("active") active?: string,
    @Query("q") q?: string,
    @Query("country") country?: string,
    @Query("take") take?: string,
    @Query("lat") lat?: string,
    @Query("lng") lng?: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const activeFilter =
      active === "true" ? true : active === "false" ? false : undefined;
    const result = await this.crisesService.listCrises({
      active: activeFilter,
      q: q || undefined,
      country: country || undefined,
      take: take ? parseInt(take, 10) : undefined,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
    });

    if (response) {
      response.status(result.status);
    }

    return result.body;
  }

  @Post("modular-fields")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @HttpCode(201)
  @ApiOperation({
    summary: "Create an admin-defined modular field for a crisis",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["crisisId", "infraType", "fieldKey"],
      properties: {
        crisisId: { type: "string", format: "uuid" },
        infraType: { type: "string", enum: Object.values(InfraType) },
        fieldKey: { type: "string", example: "wall_type" },
        fieldType: {
          type: "string",
          enum: ["string", "number", "boolean"],
          default: "string",
        },
        required: { type: "boolean", default: false },
        labels: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  })
  @ApiCreatedResponse({ type: ModularFieldMutationResponseDto })
  @ApiConflictResponse({
    description: "Duplicate field key for this crisis and infraType",
  })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  async createModularField(
    @Body() payload: Record<string, unknown>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.crisesService.createModularField(payload);
    response.status(result.status);
    return result.body;
  }

  @Get("modular-fields")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.VIEWER, Role.ANALYST, Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @ApiOperation({ summary: "List modular fields for a crisis" })
  @ApiQuery({ name: "crisisId", required: true, type: String })
  @ApiOkResponse({ type: ModularFieldListResponseDto })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  async listModularFields(
    @Query("crisisId") crisisId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.crisesService.listModularFields(crisisId ?? "");
    response.status(result.status);
    return result.body;
  }

  @Delete("modular-fields/:id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a modular field definition" })
  @ApiParam({ name: "id", type: String })
  @ApiNoContentResponse({ description: "Deleted" })
  @ApiNotFoundResponse({ description: "Not found" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  async deleteModularField(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.crisesService.deleteModularField(id);
    response.status(result.status);
    if (result.status !== 204) return result.body;
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a single crisis by ID" })
  @ApiParam({ name: "id", type: "string", description: "Crisis UUID" })
  @ApiOkResponse({ type: CrisisDto })
  @ApiNotFoundResponse({ description: "Crisis not found" })
  async getCrisis(
    @Param("id") id: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const result = await this.crisesService.getCrisis(id);

    if (response) {
      response.status(result.status);
    }

    return result.body;
  }

  @Post()
  @SkipThrottle({ default: true })
  @UseGuards(AuthGuard, RolesGuard, ThrottlerGuard)
  @Roles("admin")
  @ApiBearerAuth("bearerAuth")
  @HttpCode(201)
  @ApiOperation({ summary: "Create a new crisis" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["name", "type", "country", "startedAt"],
      properties: {
        name: { type: "string", example: "Turkey Earthquake 2026" },
        type: {
          type: "string",
          enum: Object.values(CrisisType),
          example: "EARTHQUAKE",
        },
        country: {
          type: "string",
          example: "TUR",
          description: "ISO 3166-1 alpha-3 country code",
        },
        region: { type: "string", example: "Kahramanmaraş" },
        startedAt: {
          type: "string",
          format: "date-time",
          example: "2026-02-06T00:00:00Z",
        },
        endedAt: {
          type: "string",
          format: "date-time",
          example: "2026-02-10T00:00:00Z",
        },
        description: {
          type: "string",
          example: "Critical transport corridors are blocked by debris.",
        },
        extentBBox: {
          type: "array",
          items: { type: "number" },
          minItems: 4,
          maxItems: 4,
          description:
            "Bounding box [minLng, minLat, maxLng, maxLat] (WGS-84) used for footprint lookup",
          example: [28.0, 38.0, 30.0, 40.0],
        },
      },
    },
  })
  @ApiCreatedResponse({ type: CrisisMutationResponseDto })
  @ApiBadRequestResponse({ description: "Validation error" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  async createCrisis(
    @Body() payload: Record<string, unknown>,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const result = await this.crisesService.createCrisis(payload);

    if (response) {
      response.status(result.status);
    }

    return result.body;
  }

  @Patch(":id")
  @SkipThrottle({ default: true })
  @UseGuards(AuthGuard, RolesGuard, ThrottlerGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth("bearerAuth")
  @ApiOperation({ summary: "Update a crisis" })
  @ApiParam({ name: "id", type: "string", description: "Crisis UUID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", example: "Turkey Earthquake 2026" },
        isActive: { type: "boolean", example: false },
        region: { type: "string", example: "Kahramanmaraş" },
        startedAt: {
          type: "string",
          format: "date-time",
          example: "2026-02-06T00:00:00Z",
        },
        endedAt: {
          type: "string",
          format: "date-time",
          example: "2026-02-10T00:00:00Z",
        },
        description: {
          type: "string",
          example: "Critical transport corridors are blocked by debris.",
        },
        extentBBox: {
          type: "array",
          items: { type: "number" },
          minItems: 4,
          maxItems: 4,
          description:
            "Bounding box [minLng, minLat, maxLng, maxLat] (WGS-84) used for footprint lookup",
          example: [28.0, 38.0, 30.0, 40.0],
        },
      },
    },
  })
  @ApiOkResponse({ type: CrisisMutationResponseDto })
  @ApiBadRequestResponse({ description: "Validation error" })
  @ApiNotFoundResponse({ description: "Crisis not found" })
  @ApiUnauthorizedResponse({ description: "Unauthorized" })
  @ApiForbiddenResponse({ description: "Forbidden" })
  @ApiTooManyRequestsResponse({ description: "Rate limit exceeded" })
  async patchCrisis(
    @Param("id") id: string,
    @Body() payload: Record<string, unknown>,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const result = await this.crisesService.patchCrisis(id, payload);

    if (response) {
      response.status(result.status);
    }

    return result.body;
  }

  @Get(":id/footprints")
  @ApiOperation({ summary: "Get building footprints for a crisis" })
  @ApiParam({ name: "id", type: "string", description: "Crisis UUID" })
  @ApiOkResponse({ type: CrisisFootprintFeatureCollectionDto })
  @ApiNotFoundResponse({ description: "Crisis not found" })
  async getCrisisFootprints(
    @Param("id") id: string,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const result = await this.crisesService.getCrisisFootprints(id);

    if (response) {
      response.status(result.status);
    }

    return result.body;
  }

  @Post(":id/modular-schema")
  @ApiOperation({ summary: "Get dynamic field schema for a crisis infra type" })
  @ApiParam({ name: "id", type: "string", description: "Crisis UUID" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["infraType"],
      properties: {
        infraType: {
          type: "string",
          enum: Object.values(InfraType),
          example: "RESIDENTIAL",
        },
      },
    },
  })
  @ApiOkResponse({ type: ModularSchemaResponseDto })
  @ApiBadRequestResponse({ description: "Validation error" })
  @ApiNotFoundResponse({ description: "Crisis not found" })
  async getModularSchema(
    @Param("id") id: string,
    @Body() payload: Record<string, unknown>,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const result = await this.crisesService.getModularSchema(id, payload);

    if (response) {
      response.status(result.status);
    }

    return result.body;
  }
}
