import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ForbiddenException } from "@nestjs/common";
import { SetupController } from "./setup.controller";
import { PrismaService } from "../prisma/prisma.service";
import * as seedData from "../prisma/seed-data";

jest.mock("../prisma/seed-data", () => ({
  seedLocalTestData: jest.fn().mockResolvedValue("seeded"),
}));

const mockConfig = (seed?: string) => ({
  get: jest.fn().mockReturnValue(seed),
});

const mockPrisma = {} as PrismaService;

describe("SetupController", () => {
  let controller: SetupController;
  let configService: { get: jest.Mock };

  async function build(seedSecret?: string) {
    configService = mockConfig(seedSecret);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SetupController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    controller = module.get(SetupController);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when SEED_SECRET is not configured", async () => {
    await build(undefined);
    await expect(controller.seed("Bearer anything")).rejects.toThrow(
      ForbiddenException,
    );
    expect(seedData.seedLocalTestData).not.toHaveBeenCalled();
  });

  it("returns 403 when authorization header is missing", async () => {
    await build("correct-secret");
    await expect(controller.seed(undefined)).rejects.toThrow(ForbiddenException);
    expect(seedData.seedLocalTestData).not.toHaveBeenCalled();
  });

  it("returns 403 when secret does not match", async () => {
    await build("correct-secret");
    await expect(controller.seed("Bearer wrong-secret")).rejects.toThrow(
      ForbiddenException,
    );
    expect(seedData.seedLocalTestData).not.toHaveBeenCalled();
  });

  it("runs seed and returns ok when secret matches", async () => {
    await build("correct-secret");
    const result = await controller.seed("Bearer correct-secret");
    expect(result).toEqual({ ok: true, message: "Database seeded successfully" });
    expect(seedData.seedLocalTestData).toHaveBeenCalledWith(mockPrisma);
  });
});
