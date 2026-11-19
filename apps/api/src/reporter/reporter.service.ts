import { Inject, Injectable } from "@nestjs/common";
import { BadgeLevel } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type ReporterProfileData = {
  reporterId: string;
  reportCount: number;
  badgeLevel: BadgeLevel;
  lastActiveAt: Date;
};

function computeBadgeLevel(count: number): BadgeLevel {
  if (count >= 50) return BadgeLevel.EXPERT;
  if (count >= 20) return BadgeLevel.TRUSTED;
  if (count >= 5) return BadgeLevel.CONTRIBUTOR;
  return BadgeLevel.NEWCOMER;
}

@Injectable()
export class ReporterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async upsertProfile(reporterId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.reporterProfile.findUnique({
        where: { reporterId },
      });
      const newCount = (current?.reportCount ?? 0) + 1;
      const newBadge = computeBadgeLevel(newCount);

      await tx.reporterProfile.upsert({
        where: { reporterId },
        create: {
          reporterId,
          reportCount: newCount,
          badgeLevel: newBadge,
          lastActiveAt: new Date(),
        },
        update: {
          reportCount: newCount,
          badgeLevel: newBadge,
          lastActiveAt: new Date(),
        },
      });
    });
  }

  async getProfile(
    reporterId: string,
  ): Promise<{ found: true; profile: ReporterProfileData } | { found: false }> {
    const profile = await this.prisma.reporterProfile.findUnique({
      where: { reporterId },
      select: {
        reporterId: true,
        reportCount: true,
        badgeLevel: true,
        lastActiveAt: true,
      },
    });

    if (!profile) return { found: false };

    return {
      found: true,
      profile,
    };
  }
}
