import { PrismaService } from "../prisma/prisma.service";
import { ReporterService } from "./reporter.service";

function makeMockPrisma(
  existing: { reportCount: number; badgeLevel: string } | null = null,
) {
  const upsert = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(existing);

  const txObj = {
    reporterProfile: { findUnique, upsert },
  };

  return {
    ...txObj,
    $transaction: jest.fn().mockImplementation(
      (fn: (tx: typeof txObj) => Promise<void>) => fn(txObj),
    ),
  } as unknown as PrismaService & {
    reporterProfile: { upsert: jest.Mock; findUnique: jest.Mock };
  };
}

describe("ReporterService", () => {
  it("creates a new profile with reportCount=1 and NEWCOMER badge on first submission", async () => {
    const prisma = makeMockPrisma(null);
    const service = new ReporterService(prisma);

    await service.upsertProfile("device-abc");

    expect(
      (prisma as { reporterProfile: { upsert: jest.Mock } }).reporterProfile
        .upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reporterId: "device-abc" },
        create: expect.objectContaining({
          reporterId: "device-abc",
          reportCount: 1,
          badgeLevel: "NEWCOMER",
        }),
        update: expect.objectContaining({
          reportCount: 1,
          badgeLevel: "NEWCOMER",
        }),
      }),
    );
  });

  it("increments reportCount on existing profile", async () => {
    const prisma = makeMockPrisma({ reportCount: 3, badgeLevel: "NEWCOMER" });
    const service = new ReporterService(prisma);

    await service.upsertProfile("device-abc");

    expect(
      (prisma as { reporterProfile: { upsert: jest.Mock } }).reporterProfile
        .upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ reportCount: 4, badgeLevel: "NEWCOMER" }),
      }),
    );
  });

  it("upgrades badge to CONTRIBUTOR when reportCount reaches 5", async () => {
    const prisma = makeMockPrisma({ reportCount: 4, badgeLevel: "NEWCOMER" });
    const service = new ReporterService(prisma);

    await service.upsertProfile("device-abc");

    expect(
      (prisma as { reporterProfile: { upsert: jest.Mock } }).reporterProfile
        .upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          reportCount: 5,
          badgeLevel: "CONTRIBUTOR",
        }),
      }),
    );
  });

  it("upgrades badge to TRUSTED when reportCount reaches 20", async () => {
    const prisma = makeMockPrisma({ reportCount: 19, badgeLevel: "CONTRIBUTOR" });
    const service = new ReporterService(prisma);

    await service.upsertProfile("device-abc");

    expect(
      (prisma as { reporterProfile: { upsert: jest.Mock } }).reporterProfile
        .upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          reportCount: 20,
          badgeLevel: "TRUSTED",
        }),
      }),
    );
  });

  it("upgrades badge to EXPERT when reportCount reaches 50", async () => {
    const prisma = makeMockPrisma({ reportCount: 49, badgeLevel: "TRUSTED" });
    const service = new ReporterService(prisma);

    await service.upsertProfile("device-abc");

    expect(
      (prisma as { reporterProfile: { upsert: jest.Mock } }).reporterProfile
        .upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          reportCount: 50,
          badgeLevel: "EXPERT",
        }),
      }),
    );
  });

  it("returns the profile when found", async () => {
    const now = new Date();
    const prismaForGet = {
      reporterProfile: {
        findUnique: jest.fn().mockResolvedValue({
          reporterId: "device-xyz",
          reportCount: 7,
          badgeLevel: "CONTRIBUTOR",
          lastActiveAt: now,
        }),
      },
    } as unknown as PrismaService;
    const service = new ReporterService(prismaForGet);

    const result = await service.getProfile("device-xyz");

    expect(result).toEqual({
      found: true,
      profile: {
        reporterId: "device-xyz",
        reportCount: 7,
        badgeLevel: "CONTRIBUTOR",
        lastActiveAt: now,
      },
    });
  });

  it("returns found=false when no profile exists for reporterId", async () => {
    const prismaForGet = {
      reporterProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
    const service = new ReporterService(prismaForGet);

    const result = await service.getProfile("unknown-device");

    expect(result).toEqual({ found: false });
  });
});
