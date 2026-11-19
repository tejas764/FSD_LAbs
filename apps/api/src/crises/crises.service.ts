import { Inject, Injectable } from "@nestjs/common";
import { Crisis, CrisisType, InfraType, Prisma } from "@prisma/client";
import { z } from "zod";
import { ErrorCode } from "../common/error-codes";
import { PrismaService } from "../prisma/prisma.service";
import { CrisisCacheService } from "./crisis-cache.service";
import { FootprintsSourceService } from "./footprints-source.service";

const createCrisisSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(CrisisType),
  country: z.string().min(1),
  region: z.string().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  description: z.string().trim().min(1).optional(),
  extentBBox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional(),
});

const patchCrisisSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  region: z.string().optional(),
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  description: z.string().trim().min(1).optional(),
  extentBBox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .optional(),
});

const modularSchemaRequestSchema = z.object({
  infraType: z.nativeEnum(InfraType),
});

const FIELD_TYPES = ["string", "number", "boolean"] as const;

const createModularFieldSchema = z.object({
  crisisId: z.string().min(1),
  infraType: z.nativeEnum(InfraType),
  fieldKey: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/),
  fieldType: z.enum(FIELD_TYPES).default("string"),
  required: z.boolean().default(false),
  labels: z.record(z.string(), z.string()).optional(),
});


const CORE_FIELDS = [
  "infraType",
  "infraName",
  "crisisType",
  "hasDebris",
  "damageLevel",
  "collectedAt",
  "description",
  "electricityCondition",
  "healthServicesFunctioning",
  "pressingNeeds",
] as const;

const LANGUAGES = ["ar", "zh", "en", "fr", "ru", "es"] as const;

export type ErrorEnvelope = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type SuccessEnvelope<T> = {
  success: true;
  data: T;
};

type PrismaCrisis = Crisis;

function toCrisisResponse(crisis: PrismaCrisis) {
  const {
    extentBBoxMinLat,
    extentBBoxMinLng,
    extentBBoxMaxLat,
    extentBBoxMaxLng,
    ...rest
  } = crisis;

  const extentBBox =
    extentBBoxMinLat != null &&
    extentBBoxMinLng != null &&
    extentBBoxMaxLat != null &&
    extentBBoxMaxLng != null
      ? [extentBBoxMinLng, extentBBoxMinLat, extentBBoxMaxLng, extentBBoxMaxLat]
      : null;

  return { ...rest, extentBBox };
}

@Injectable()
export class CrisesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CrisisCacheService) private readonly cache: CrisisCacheService,
    @Inject(FootprintsSourceService)
    private readonly footprintsSource: FootprintsSourceService,
  ) {}

  async listCrises(filters: {
    active?: boolean;
    q?: string;
    country?: string;
    take?: number;
    lat?: number;
    lng?: number;
  }): Promise<{
    status: number;
    body: unknown;
  }> {
    const findManyArgs: any = {
      orderBy: { createdAt: "desc" },
      take: Math.min(filters.take ?? 50, 50),
    };

    const where: Record<string, unknown> = {};

    if (filters.active !== undefined) {
      if (filters.active) {
        where.isActive = true;
        where.startedAt = { lte: new Date() };
      } else {
        where.isActive = false;
      }
    }

    if (filters.q) {
      where.OR = [
        { name: { contains: filters.q, mode: "insensitive" } },
        { country: { contains: filters.q, mode: "insensitive" } },
        { region: { contains: filters.q, mode: "insensitive" } },
      ];
    }

    if (filters.country) {
      where.country = filters.country;
    }

    if (filters.lat !== undefined && filters.lng !== undefined) {
      where.AND = [
        { extentBBoxMinLat: { lte: filters.lat } },
        { extentBBoxMaxLat: { gte: filters.lat } },
        { extentBBoxMinLng: { lte: filters.lng } },
        { extentBBoxMaxLng: { gte: filters.lng } },
      ];
    }

    if (Object.keys(where).length > 0) {
      findManyArgs.where = where;
    }

    const crises = await this.prisma.crisis.findMany(findManyArgs);
    return {
      status: 200,
      body: crises.map(toCrisisResponse),
    };
  }

  async getCrisisFootprints(id: string): Promise<{
    status: number;
    body: unknown;
  }> {
    const crisis = await this.prisma.crisis.findUnique({ where: { id } });

    if (!crisis) {
      return {
        status: 404,
        body: {
          success: false,
          error: {
            code: ErrorCode.CRISIS_NOT_FOUND,
            message: `Crisis "${id}" not found`,
          },
        },
      };
    }

    const cacheKey = `crisis:footprints:${id}`;
    const cached = await this.cache.get<unknown>(cacheKey);
    if (cached) {
      return {
        status: 200,
        body: cached,
      };
    }

    try {
      const footprints = await this.footprintsSource.fetchByCrisisId(crisis);
      await this.cache.set(cacheKey, footprints, 3600);

      return {
        status: 200,
        body: footprints,
      };
    } catch {
      const fallback = {
        type: "FeatureCollection",
        features: [],
        metadata: {
          source: "fallback",
          reason: "LOCAL_FOOTPRINT_SOURCE_UNAVAILABLE",
        },
      };

      await this.cache.set(cacheKey, fallback, 300);
      return {
        status: 200,
        body: fallback,
      };
    }
  }

  async getModularSchema(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<{
    status: number;
    body: unknown;
  }> {
    const parsedPayload = modularSchemaRequestSchema.safeParse(payload);

    if (!parsedPayload.success) {
      const firstIssue = parsedPayload.error.issues[0];
      const path = firstIssue?.path?.join(".");
      const message = path
        ? `${path}: ${firstIssue.message}`
        : (firstIssue?.message ?? "Invalid payload");

      return {
        status: 400,
        body: {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message,
            details: {
              path: firstIssue?.path,
            },
          },
        },
      };
    }

    const crisis = await this.prisma.crisis.findUnique({ where: { id } });

    if (!crisis) {
      return {
        status: 404,
        body: {
          success: false,
          error: {
            code: ErrorCode.CRISIS_NOT_FOUND,
            message: `Crisis "${id}" not found`,
          },
        },
      };
    }

    const infraType = parsedPayload.data.infraType;

    const dbFields = await this.prisma.modularField.findMany({
      where: { crisisId: id, infraType },
      orderBy: { createdAt: "asc" },
    });

    const dynamicFields = Object.fromEntries(
      dbFields.map((f) => [
        f.fieldKey,
        {
          key: f.fieldKey,
          type: f.fieldType,
          required: f.required,
          labels:
            (f.labels as Record<string, string>) ??
            Object.fromEntries(LANGUAGES.map((l) => [l, f.fieldKey])),
          placeholders: Object.fromEntries(LANGUAGES.map((l) => [l, ""])),
        },
      ]),
    );

    return {
      status: 200,
      body: {
        success: true,
        data: {
          crisisType: crisis.type,
          infraType,
          requiredCoreFields: [...CORE_FIELDS],
          dynamicFields,
        },
      },
    };
  }

  async createModularField(payload: Record<string, unknown>): Promise<{
    status: number;
    body: unknown;
  }> {
    const parsed = createModularFieldSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const path = firstIssue?.path?.join(".");
      const message = path
        ? `${path}: ${firstIssue.message}`
        : (firstIssue?.message ?? "Invalid payload");
      return {
        status: 400,
        body: {
          success: false,
          error: { code: ErrorCode.VALIDATION_ERROR, message },
        },
      };
    }

    const { crisisId, infraType, fieldKey, fieldType, required, labels } =
      parsed.data;

    const crisis = await this.prisma.crisis.findUnique({
      where: { id: crisisId },
    });
    if (!crisis) {
      return {
        status: 404,
        body: {
          success: false,
          error: {
            code: ErrorCode.CRISIS_NOT_FOUND,
            message: `Crisis "${crisisId}" not found`,
          },
        },
      };
    }

    try {
      const field = await this.prisma.modularField.create({
        data: {
          crisisId,
          infraType,
          fieldKey,
          fieldType,
          required,
          labels:
            labels !== undefined
              ? (labels as unknown as Prisma.InputJsonValue)
              : undefined,
        },
      });
      return {
        status: 201,
        body: { success: true, data: field },
      };
    } catch (err: unknown) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return {
          status: 409,
          body: {
            success: false,
            error: {
              code: ErrorCode.VALIDATION_ERROR,
              message: `Field "${fieldKey}" already defined for this crisis and infraType`,
            },
          },
        };
      }
      throw err;
    }
  }

  async listModularFields(crisisId: string): Promise<{
    status: number;
    body: unknown;
  }> {
    const fields = await this.prisma.modularField.findMany({
      where: { crisisId },
      orderBy: { createdAt: "asc" },
    });
    return {
      status: 200,
      body: { success: true, data: fields },
    };
  }

  async deleteModularField(id: string): Promise<{
    status: number;
    body: unknown;
  }> {
    const field = await this.prisma.modularField.findUnique({ where: { id } });
    if (!field) {
      return {
        status: 404,
        body: {
          success: false,
          error: {
            code: "MODULAR_FIELD_NOT_FOUND",
            message: `Modular field "${id}" not found`,
          },
        },
      };
    }
    await this.prisma.modularField.delete({ where: { id } });
    return { status: 204, body: null };
  }

  async getCrisis(id: string): Promise<{
    status: number;
    body: unknown;
  }> {
    const crisis = await this.prisma.crisis.findUnique({
      where: { id },
    });

    if (!crisis) {
      return {
        status: 404,
        body: {
          success: false,
          error: {
            code: ErrorCode.CRISIS_NOT_FOUND,
            message: `Crisis "${id}" not found`,
          },
        },
      };
    }

    return {
      status: 200,
      body: toCrisisResponse(crisis),
    };
  }

  async createCrisis(payload: Record<string, unknown>): Promise<{
    status: number;
    body: ErrorEnvelope | SuccessEnvelope<unknown>;
  }> {
    const parsed = createCrisisSchema.safeParse(payload);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const path = firstIssue?.path?.join(".");
      const message = path
        ? `${path}: ${firstIssue.message}`
        : (firstIssue?.message ?? "Invalid payload");

      return {
        status: 400,
        body: {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message,
            details: {
              path: firstIssue?.path,
            },
          },
        },
      };
    }

    const data = parsed.data;
    const bboxData = data.extentBBox
      ? {
          extentBBoxMinLng: data.extentBBox[0],
          extentBBoxMinLat: data.extentBBox[1],
          extentBBoxMaxLng: data.extentBBox[2],
          extentBBoxMaxLat: data.extentBBox[3],
        }
      : {};
    const crisis = await this.prisma.crisis.create({
      data: {
        name: data.name,
        type: data.type,
        country: data.country,
        region: data.region,
        startedAt: new Date(data.startedAt),
        endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
        description: data.description,
        ...bboxData,
      },
    });

    return {
      status: 201,
      body: {
        success: true,
        data: toCrisisResponse(crisis),
      },
    };
  }

  async patchCrisis(
    id: string,
    payload: Record<string, unknown>,
  ): Promise<{
    status: number;
    body: ErrorEnvelope | SuccessEnvelope<unknown>;
  }> {
    const parsed = patchCrisisSchema.safeParse(payload);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      const path = firstIssue?.path?.join(".");
      const message = path
        ? `${path}: ${firstIssue.message}`
        : (firstIssue?.message ?? "Invalid payload");

      return {
        status: 400,
        body: {
          success: false,
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message,
            details: {
              path: firstIssue?.path,
            },
          },
        },
      };
    }

    const data = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.region !== undefined) updateData.region = data.region;
    if (data.startedAt !== undefined)
      updateData.startedAt = new Date(data.startedAt);
    if (data.endedAt !== undefined) updateData.endedAt = new Date(data.endedAt);
    if (data.description !== undefined) updateData.description = data.description;
    if (data.extentBBox !== undefined) {
      updateData.extentBBoxMinLng = data.extentBBox[0];
      updateData.extentBBoxMinLat = data.extentBBox[1];
      updateData.extentBBoxMaxLng = data.extentBBox[2];
      updateData.extentBBoxMaxLat = data.extentBBox[3];
    }

    try {
      const crisis = await this.prisma.crisis.update({
        where: { id },
        data: updateData,
      });

      return {
        status: 200,
        body: {
          success: true,
          data: toCrisisResponse(crisis),
        },
      };
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === "P2025") {
        return {
          status: 404,
          body: {
            success: false,
            error: {
              code: ErrorCode.CRISIS_NOT_FOUND,
              message: `Crisis "${id}" not found`,
            },
          },
        };
      }
      throw error;
    }
  }
}
