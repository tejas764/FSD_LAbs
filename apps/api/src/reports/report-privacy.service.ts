import { AuditAction, type PrismaClient } from "@prisma/client";
import { ReportStorageService } from "./report-storage.service";

type PrivacyPrismaClient = Pick<
  PrismaClient,
  "report" | "auditLog" | "$transaction"
>;

export async function softDeleteReport(params: {
  prisma: PrivacyPrismaClient;
  reportStorageService: ReportStorageService;
  reportId: string;
  actorId: string;
  now?: Date;
}): Promise<{ found: false } | { found: true; deletedAt: Date }> {
  const { prisma, reportStorageService, reportId, actorId } = params;
  const now = params.now ?? new Date();

  const existing = await prisma.report.findFirst({
    where: { id: reportId, deletedAt: null },
    select: {
      id: true,
      moderationStatus: true,
      deletedAt: true,
      photoKey: true,
    },
  });

  if (!existing) {
    return { found: false };
  }

  if (existing.photoKey) {
    await reportStorageService.deleteObject(existing.photoKey);
  }

  await prisma.$transaction(async (tx) => {
    await tx.report.update({
      where: { id: reportId },
      data: { deletedAt: now },
    });

    await tx.auditLog.create({
      data: {
        reportId,
        action: AuditAction.REPORT_DELETED,
        actorId,
        previousValue: {
          moderationStatus: existing.moderationStatus,
          deletedAt: existing.deletedAt,
        },
        newValue: {
          deletedAt: now.toISOString(),
        },
      },
    });
  });

  return {
    found: true,
    deletedAt: now,
  };
}

export async function anonymizeReport(params: {
  prisma: PrivacyPrismaClient;
  reportId: string;
  actorId: string;
  now?: Date;
}): Promise<{ found: false } | { found: true; anonymizedAt: Date }> {
  const { prisma, reportId, actorId } = params;
  const now = params.now ?? new Date();

  const existing = await prisma.report.findFirst({
    where: { id: reportId, deletedAt: null },
    select: {
      id: true,
      deviceHash: true,
      ipHash: true,
      latitude: true,
      longitude: true,
      locationText: true,
    },
  });

  if (!existing) {
    return { found: false };
  }

  await prisma.$transaction(async (tx) => {
    await tx.report.update({
      where: { id: reportId },
      data: {
        deviceHash: null,
        ipHash: null,
        latitude: null,
        longitude: null,
        locationText: null,
        anonymizedAt: now,
      },
    });

    await tx.auditLog.create({
      data: {
        reportId,
        action: AuditAction.REPORT_ANONYMIZED,
        actorId,
        previousValue: {
          deviceHash: existing.deviceHash,
          ipHash: existing.ipHash,
          latitude: existing.latitude,
          longitude: existing.longitude,
          locationText: existing.locationText,
        },
        newValue: {
          anonymizedAt: now.toISOString(),
          deviceHash: null,
          ipHash: null,
          latitude: null,
          longitude: null,
          locationText: null,
        },
      },
    });
  });

  return {
    found: true,
    anonymizedAt: now,
  };
}
