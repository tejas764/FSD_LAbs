import {
  CrisisType,
  DamageLevel,
  ElectricityCondition,
  HealthServicesFunctioning,
  InfraType,
  ModerationStatus,
  PressingNeed,
  AuditAction,
} from "@prisma/client";
import { seedLocalTestData } from "./seed-data";

describe("seedLocalTestData", () => {
  it("upserts multiple crises and sample reports for local testing", async () => {
    const mockPrisma = {
      user: { upsert: jest.fn().mockResolvedValue(undefined) },
      account: { upsert: jest.fn().mockResolvedValue(undefined) },
      crisis: { upsert: jest.fn().mockResolvedValue({ id: "antakya-2024" }) },
      report: { upsert: jest.fn().mockResolvedValue(undefined) },
      auditLog: { upsert: jest.fn().mockResolvedValue(undefined) },
    };

    const crisisId = await seedLocalTestData(mockPrisma as never);

    // Should create 3 seeded dashboard users (viewer, analyst, admin)
    expect(mockPrisma.user.upsert).toHaveBeenCalledTimes(3);
    expect(mockPrisma.account.upsert).toHaveBeenCalledTimes(3);

    // Should return the first (active) crisis ID
    expect(crisisId).toBe("antakya-2024");

    // Should create 6 crises (5 active: Antakya, Kabul, Aceh+Sumut, Manila, California + 1 inactive)
    expect(mockPrisma.crisis.upsert).toHaveBeenCalledTimes(6);

    // Verify first crisis (Antakya - active)
    expect(mockPrisma.crisis.upsert).toHaveBeenNthCalledWith(1, {
      where: { id: "antakya-2024" },
      create: {
        id: "antakya-2024",
        name: "Antakya Earthquake 2024",
        type: CrisisType.EARTHQUAKE,
        country: "TR",
        region: "Hatay",
        extentBBoxMinLat: 36.1,
        extentBBoxMinLng: 36.0,
        extentBBoxMaxLat: 36.3,
        extentBBoxMaxLng: 36.25,
        startedAt: new Date("2024-02-06T00:00:00.000Z"),
        isActive: true,
      },
      update: {
        id: "antakya-2024",
        name: "Antakya Earthquake 2024",
        type: CrisisType.EARTHQUAKE,
        country: "TR",
        region: "Hatay",
        extentBBoxMinLat: 36.1,
        extentBBoxMinLng: 36.0,
        extentBBoxMaxLat: 36.3,
        extentBBoxMaxLng: 36.25,
        startedAt: new Date("2024-02-06T00:00:00.000Z"),
        isActive: true,
      },
    });

    // Should create 87 reports across all 5 active crises for pagination testing
    expect(mockPrisma.report.upsert).toHaveBeenCalledTimes(87);
    expect(mockPrisma.report.upsert).toHaveBeenNthCalledWith(1, {
      where: { id: "report-antakya-school" },
      create: {
        id: "report-antakya-school",
        crisisId: "antakya-2024",
        damageLevel: DamageLevel.PARTIAL,
        infraType: InfraType.RESIDENTIAL,
        infraName: "School Building A",
        crisisType: CrisisType.EARTHQUAKE,
        hasDebris: true,
        collectedAt: new Date("2025-02-07T09:30:00.000Z"),
        description: "Wall cracks and partial roof damage",
        electricityCondition: ElectricityCondition.SEVERE_DAMAGE,
        healthServicesFunctioning:
          HealthServicesFunctioning.PARTIALLY_FUNCTIONAL,
        pressingNeeds: [PressingNeed.FOOD_WATER, PressingNeed.SHELTER_REPAIR],
        extraFields: {},
        latitude: 36.2021,
        longitude: 36.1601,
        locationText: "Near central school compound",
        moderationStatus: ModerationStatus.PENDING,
      },
      update: {
        damageLevel: DamageLevel.PARTIAL,
        infraType: InfraType.RESIDENTIAL,
        infraName: "School Building A",
        crisisType: CrisisType.EARTHQUAKE,
        hasDebris: true,
        collectedAt: new Date("2025-02-07T09:30:00.000Z"),
        description: "Wall cracks and partial roof damage",
        electricityCondition: ElectricityCondition.SEVERE_DAMAGE,
        healthServicesFunctioning:
          HealthServicesFunctioning.PARTIALLY_FUNCTIONAL,
        pressingNeeds: [PressingNeed.FOOD_WATER, PressingNeed.SHELTER_REPAIR],
        extraFields: {},
        latitude: 36.2021,
        longitude: 36.1601,
        locationText: "Near central school compound",
        moderationStatus: ModerationStatus.PENDING,
        deletedAt: null,
      },
    });

    const moderationStatuses = mockPrisma.report.upsert.mock.calls.map(
      (call: [{ create: { moderationStatus: ModerationStatus } }]) =>
        call[0].create.moderationStatus,
    );
    // Verify that we have various moderation statuses represented
    expect(moderationStatuses).toContain(ModerationStatus.PENDING);
    expect(moderationStatuses).toContain(ModerationStatus.APPROVED);
    expect(moderationStatuses).toContain(ModerationStatus.FLAGGED);
    // Verify total count is 87 (20 Antakya + 20 Kabul + 20 Aceh + 15 Manila + 12 California)
    expect(moderationStatuses.length).toBe(87);

    // Should create 3 audit log entries for report-antakya-highway
    expect(mockPrisma.auditLog.upsert).toHaveBeenCalledTimes(3);

    // First audit: flagged for verification
    expect(mockPrisma.auditLog.upsert).toHaveBeenNthCalledWith(1, {
      where: { id: "audit-highway-001" },
      create: {
        id: "audit-highway-001",
        reportId: "report-antakya-highway",
        action: AuditAction.REPORT_MODERATION_UPDATED,
        actorId: "analyst-seed-user",
        previousValue: { moderationStatus: ModerationStatus.PENDING },
        newValue: {
          moderationStatus: ModerationStatus.FLAGGED,
          reason: "Bridge damage claims need field verification",
        },
        createdAt: expect.any(Date),
      },
      update: {},
    });

    // Second audit: changed to under review
    expect(mockPrisma.auditLog.upsert).toHaveBeenNthCalledWith(2, {
      where: { id: "audit-highway-002" },
      create: {
        id: "audit-highway-002",
        reportId: "report-antakya-highway",
        action: AuditAction.REPORT_MODERATION_UPDATED,
        actorId: "analyst-seed-user",
        previousValue: { moderationStatus: ModerationStatus.FLAGGED },
        newValue: {
          moderationStatus: ModerationStatus.UNDER_REVIEW,
          reason: "Requested photos from reporter",
        },
        createdAt: expect.any(Date),
      },
      update: {},
    });

    // Third audit: changed to approved
    expect(mockPrisma.auditLog.upsert).toHaveBeenNthCalledWith(3, {
      where: { id: "audit-highway-003" },
      create: {
        id: "audit-highway-003",
        reportId: "report-antakya-highway",
        action: AuditAction.REPORT_MODERATION_UPDATED,
        actorId: "analyst-seed-user",
        previousValue: { moderationStatus: ModerationStatus.UNDER_REVIEW },
        newValue: {
          moderationStatus: ModerationStatus.APPROVED,
          reason: "Photos verified - complete damage confirmed",
        },
        createdAt: expect.any(Date),
      },
      update: {},
    });

    const retentionCutoff = Date.now() - 730 * 24 * 60 * 60 * 1000;
    for (const call of mockPrisma.report.upsert.mock.calls) {
      const collectedAt = call[0].create.collectedAt as Date;
      expect(collectedAt.getTime()).toBeGreaterThanOrEqual(retentionCutoff);
      expect(call[0].update.deletedAt).toBeNull();
    }
  });
});
