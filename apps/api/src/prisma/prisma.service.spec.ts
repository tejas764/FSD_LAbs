import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { PrismaService } from "./prisma.service";

describe("PrismaService", () => {
  it("exposes lifecycle methods", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockReturnValue(
                "postgresql://crisismap:crisismap@localhost:5432/crisismap",
              ),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(PrismaService);

    expect(service.onModuleInit).toBeDefined();
    expect(service.enableShutdownHooks).toBeDefined();

    await moduleRef.close();
  });
});
