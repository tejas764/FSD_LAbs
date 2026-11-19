import {
  CrisisType,
  DamageLevel,
  ElectricityCondition,
  HealthServicesFunctioning,
  InfraType,
  ModerationStatus,
  PressingNeed,
  PrismaClient,
  AuditAction,
  Prisma,
} from "@prisma/client";
import { randomBytes, scrypt as nodeScrypt } from "crypto";

/**
 * Produce a better-auth-compatible scrypt hash.
 * Format matches @better-auth/utils/password: <saltHex>:<keyHex>
 * Uses salt as hex string (as scrypt input), N=16384, r=16, p=1, keylen=64.
 */
async function hashPassword(password: string): Promise<string> {
  const saltBytes = randomBytes(16);
  const saltHex = saltBytes.toString("hex");
  const key = await new Promise<Buffer>((resolve, reject) =>
    nodeScrypt(password.normalize("NFKC"), saltHex, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 }, (err, buf) =>
      err ? reject(err) : resolve(buf),
    ),
  );
  return `${saltHex}:${key.toString("hex")}`;
}

type SeedClient = Pick<PrismaClient, "crisis" | "report" | "auditLog" | "user" | "account">;

// Local test crises — diverse geographical locations for pagination testing
const CRISES = [
  {
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
  {
    id: "kabul-2025",
    name: "Kabul Flood 2025",
    type: CrisisType.FLOOD,
    country: "AF",
    region: "Kabul",
    extentBBoxMinLat: 34.4,
    extentBBoxMinLng: 69.1,
    extentBBoxMaxLat: 34.6,
    extentBBoxMaxLng: 69.4,
    startedAt: new Date("2025-08-15T00:00:00.000Z"),
    isActive: true,
  },
  {
    id: "aceh-sumut-flood-2025",
    name: "Aceh & North Sumatra Floods 2025",
    type: CrisisType.FLOOD,
    country: "ID",
    region: "Aceh & Sumatera Utara",
    extentBBoxMinLat: 1.0,
    extentBBoxMinLng: 95.0,
    extentBBoxMaxLat: 5.8,
    extentBBoxMaxLng: 100.0,
    startedAt: new Date("2025-11-25T00:00:00.000Z"),
    isActive: true,
  },
  {
    id: "manila-typhoon-2025",
    name: "Manila Typhoon 2025",
    type: CrisisType.HURRICANE_CYCLONE,
    country: "PH",
    region: "Metro Manila",
    extentBBoxMinLat: 14.3,
    extentBBoxMinLng: 120.8,
    extentBBoxMaxLat: 14.8,
    extentBBoxMaxLng: 121.2,
    startedAt: new Date("2025-09-10T00:00:00.000Z"),
    isActive: true,
  },
  {
    id: "california-wildfire-2025",
    name: "California Wildfire 2025",
    type: CrisisType.WILDFIRE,
    country: "US",
    region: "Northern California",
    extentBBoxMinLat: 39.5,
    extentBBoxMinLng: -121.5,
    extentBBoxMaxLat: 40.5,
    extentBBoxMaxLng: -120.5,
    startedAt: new Date("2025-10-15T00:00:00.000Z"),
    isActive: true,
  },
  {
    id: "test-crisis-inactive",
    name: "Inactive Test Crisis",
    type: CrisisType.EARTHQUAKE,
    country: "SY",
    region: "Aleppo",
    extentBBoxMinLat: 36.15,
    extentBBoxMinLng: 37.1,
    extentBBoxMaxLat: 36.25,
    extentBBoxMaxLng: 37.25,
    startedAt: new Date("2026-01-01T00:00:00.000Z"),
    isActive: false,
  },
];

export async function seedLocalTestData(prisma: SeedClient): Promise<string> {
  // Seed dashboard roles for local UI role-gating checks.
  const seedUsers = [
    { id: "seed-user-viewer", email: "viewer@crisismap.local", name: "Viewer User", role: "viewer" },
    { id: "seed-user-admin", email: "admin@crisismap.local", name: "Admin User", role: "admin" },
    { id: "seed-user-analyst", email: "analyst@crisismap.local", name: "Analyst User", role: "analyst" },
  ];

  for (const u of seedUsers) {
    await prisma.user.upsert({
      where: { id: u.id },
      create: { id: u.id, email: u.email, name: u.name, role: u.role, emailVerified: true },
      update: { role: u.role, emailVerified: true },
    });

    const passwordHash = await hashPassword("Password123!");
    await prisma.account.upsert({
      where: { id: `${u.id}-credential` },
      create: {
        id: `${u.id}-credential`,
        accountId: u.id,
        providerId: "credential",
        userId: u.id,
        password: passwordHash,
      },
      update: { password: passwordHash },
    });
  }

  // Seed all crises
  for (const crisisData of CRISES) {
    await prisma.crisis.upsert({
      where: { id: crisisData.id },
      create: crisisData,
      update: { ...crisisData, isActive: crisisData.isActive },
    });
  }

  const crisisId = CRISES[0].id; // Use first (active) crisis for majority of reports

  // Helper to generate reports across crises for pagination testing
  interface ReportDraft {
    id: string;
    crisisId: string;
    damageLevel: DamageLevel;
    infraType: InfraType;
    infraName: string;
    crisisType: CrisisType;
    hasDebris: boolean;
    collectedAt: Date;
    description: string;
    electricityCondition: ElectricityCondition;
    healthServicesFunctioning: HealthServicesFunctioning;
    pressingNeeds: PressingNeed[];
    extraFields: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
    latitude: number;
    longitude: number;
    locationText: string;
    moderationStatus: ModerationStatus;
  }

  const sampleReports: ReportDraft[] = [
    // ─── Antakya Earthquake reports (original 5 + 15 additional = 20 total)
    {
      id: "report-antakya-school",
      crisisId: CRISES[0].id,
      damageLevel: DamageLevel.PARTIAL,
      infraType: InfraType.RESIDENTIAL,
      infraName: "School Building A",
      crisisType: CrisisType.EARTHQUAKE,
      hasDebris: true,
      collectedAt: new Date("2025-02-07T09:30:00.000Z"),
      description: "Wall cracks and partial roof damage",
      electricityCondition: ElectricityCondition.SEVERE_DAMAGE,
      healthServicesFunctioning: HealthServicesFunctioning.PARTIALLY_FUNCTIONAL,
      pressingNeeds: [PressingNeed.FOOD_WATER, PressingNeed.SHELTER_REPAIR],
      extraFields: {},
      latitude: 36.2021,
      longitude: 36.1601,
      locationText: "Near central school compound",
      moderationStatus: ModerationStatus.PENDING,
    },
    {
      id: "report-antakya-utility",
      crisisId: CRISES[0].id,
      damageLevel: DamageLevel.COMPLETE,
      infraType: InfraType.UTILITY,
      infraName: "Water Pump Station",
      crisisType: CrisisType.EARTHQUAKE,
      hasDebris: false,
      collectedAt: new Date("2025-02-08T12:00:00.000Z"),
      description: "Pump station collapsed",
      electricityCondition: ElectricityCondition.NO_DAMAGE,
      healthServicesFunctioning: HealthServicesFunctioning.FULLY_FUNCTIONAL,
      pressingNeeds: [PressingNeed.WASH, PressingNeed.BASIC_SERVICES],
      extraFields: {},
      latitude: 36.2105,
      longitude: 36.1703,
      locationText: "North district utility corridor",
      moderationStatus: ModerationStatus.APPROVED,
    },
    {
      id: "report-antakya-market",
      crisisId: CRISES[0].id,
      damageLevel: DamageLevel.MINIMAL,
      infraType: InfraType.COMMERCIAL,
      infraName: "Marketplace Block C",
      crisisType: CrisisType.EARTHQUAKE,
      hasDebris: false,
      collectedAt: new Date("2025-02-09T09:00:00.000Z"),
      description: "Minor facade damage and broken windows",
      electricityCondition: ElectricityCondition.MINOR_DAMAGE,
      healthServicesFunctioning: HealthServicesFunctioning.FULLY_FUNCTIONAL,
      pressingNeeds: [PressingNeed.LIVELIHOODS_RESTORATION],
      extraFields: {},
      latitude: 36.2059,
      longitude: 36.1642,
      locationText: "Old market quarter",
      moderationStatus: ModerationStatus.FLAGGED,
    },
    {
      id: "report-antakya-clinic",
      crisisId: CRISES[0].id,
      damageLevel: DamageLevel.PARTIAL,
      infraType: InfraType.COMMUNITY,
      infraName: "Neighborhood Clinic",
      crisisType: CrisisType.EARTHQUAKE,
      hasDebris: true,
      collectedAt: new Date("2025-02-09T14:45:00.000Z"),
      description: "Interior ceiling collapse, services reduced",
      electricityCondition: ElectricityCondition.MODERATE_DAMAGE,
      healthServicesFunctioning: HealthServicesFunctioning.PARTIALLY_FUNCTIONAL,
      pressingNeeds: [PressingNeed.HEALTHCARE_MEDICINES, PressingNeed.BASIC_SERVICES],
      extraFields: {},
      latitude: 36.1987,
      longitude: 36.1523,
      locationText: "Southwest neighborhood clinic",
      moderationStatus: ModerationStatus.PENDING,
    },
    {
      id: "report-antakya-highway",
      crisisId: CRISES[0].id,
      damageLevel: DamageLevel.COMPLETE,
      infraType: InfraType.TRANSPORT_COMMUNICATION,
      infraName: "Highway Bridge Segment 4",
      crisisType: CrisisType.EARTHQUAKE,
      hasDebris: true,
      collectedAt: new Date("2025-02-10T08:20:00.000Z"),
      description: "Bridge deck failure and blocked traffic lanes",
      electricityCondition: ElectricityCondition.NO_DAMAGE,
      healthServicesFunctioning: HealthServicesFunctioning.LARGELY_DISRUPTED,
      pressingNeeds: [PressingNeed.BASIC_SERVICES, PressingNeed.CASH_ASSISTANCE],
      extraFields: {},
      latitude: 36.2149,
      longitude: 36.1786,
      locationText: "Eastern bypass bridge",
      moderationStatus: ModerationStatus.PENDING,
    },
    // Additional Antakya reports (6-20)
    ...Array.from({ length: 15 }, (_, i) => ({
      id: `report-antakya-bulk-${i + 1}`,
      crisisId: CRISES[0].id,
      damageLevel: [DamageLevel.MINIMAL, DamageLevel.PARTIAL, DamageLevel.COMPLETE][i % 3],
      infraType: [InfraType.RESIDENTIAL, InfraType.COMMERCIAL, InfraType.GOVERNMENT, InfraType.UTILITY][i % 4],
      infraName: `Building ${String.fromCharCode(66 + i)}`,
      crisisType: CrisisType.EARTHQUAKE,
      hasDebris: i % 2 === 0,
      collectedAt: new Date(Date.parse("2025-02-10T00:00:00.000Z") + i * 3600000),
      description: `Damage assessment report #${i + 1}`,
      electricityCondition: [
        ElectricityCondition.NO_DAMAGE,
        ElectricityCondition.MINOR_DAMAGE,
        ElectricityCondition.MODERATE_DAMAGE,
        ElectricityCondition.SEVERE_DAMAGE,
        ElectricityCondition.COMPLETELY_DESTROYED,
      ][i % 5],
      healthServicesFunctioning: [
        HealthServicesFunctioning.FULLY_FUNCTIONAL,
        HealthServicesFunctioning.PARTIALLY_FUNCTIONAL,
        HealthServicesFunctioning.LARGELY_DISRUPTED,
        HealthServicesFunctioning.NOT_FUNCTIONING,
      ][i % 4],
      pressingNeeds: [[PressingNeed.FOOD_WATER], [PressingNeed.SHELTER_REPAIR], [PressingNeed.HEALTHCARE_MEDICINES]][i % 3],
      extraFields: {},
      latitude: 36.15 + (i * 0.005),
      longitude: 36.10 + (i * 0.005),
      locationText: `Location Zone ${i + 1}`,
      moderationStatus: [ModerationStatus.PENDING, ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.FLAGGED, ModerationStatus.UNDER_REVIEW][i % 5],
    })),

    // ─── Kabul Flood reports (20 reports)
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `report-kabul-${i + 1}`,
      crisisId: CRISES[1].id,
      damageLevel: [DamageLevel.MINIMAL, DamageLevel.PARTIAL, DamageLevel.COMPLETE][i % 3],
      infraType: [InfraType.RESIDENTIAL, InfraType.COMMERCIAL, InfraType.COMMUNITY, InfraType.UTILITY][i % 4],
      infraName: `Kabul District ${i + 1}`,
      crisisType: CrisisType.FLOOD,
      hasDebris: i % 3 === 0,
      collectedAt: new Date(Date.parse("2025-08-20T00:00:00.000Z") + i * 3600000),
      description: `Flood damage assessment #${i + 1}`,
      electricityCondition: [ElectricityCondition.NO_DAMAGE, ElectricityCondition.MINOR_DAMAGE, ElectricityCondition.MODERATE_DAMAGE][i % 3],
      healthServicesFunctioning: [HealthServicesFunctioning.FULLY_FUNCTIONAL, HealthServicesFunctioning.PARTIALLY_FUNCTIONAL][i % 2],
      pressingNeeds: [[PressingNeed.FOOD_WATER, PressingNeed.WASH], [PressingNeed.SHELTER_REPAIR]][(i % 2)],
      extraFields: {},
      latitude: 34.42 + (i * 0.003),
      longitude: 69.15 + (i * 0.003),
      locationText: `Kabul Zone ${i + 1}`,
      moderationStatus: [ModerationStatus.PENDING, ModerationStatus.APPROVED, ModerationStatus.FLAGGED][i % 3],
    })),

    // ─── Aceh & Sumatra Flood reports (20 reports)
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `report-aceh-${i + 1}`,
      crisisId: CRISES[2].id,
      damageLevel: [DamageLevel.MINIMAL, DamageLevel.PARTIAL, DamageLevel.COMPLETE][i % 3],
      infraType: [InfraType.RESIDENTIAL, InfraType.COMMERCIAL, InfraType.TRANSPORT_COMMUNICATION, InfraType.UTILITY][i % 4],
      infraName: `Aceh Infrastructure ${i + 1}`,
      crisisType: CrisisType.FLOOD,
      hasDebris: i % 2 === 0,
      collectedAt: new Date(Date.parse("2025-11-30T00:00:00.000Z") + i * 3600000),
      description: `Flood impact assessment #${i + 1}`,
      electricityCondition: [ElectricityCondition.NO_DAMAGE, ElectricityCondition.SEVERE_DAMAGE, ElectricityCondition.COMPLETELY_DESTROYED][i % 3],
      healthServicesFunctioning: [HealthServicesFunctioning.PARTIALLY_FUNCTIONAL, HealthServicesFunctioning.LARGELY_DISRUPTED][i % 2],
      pressingNeeds: [[PressingNeed.FOOD_WATER, PressingNeed.WASH], [PressingNeed.BASIC_SERVICES]][(i % 2)],
      extraFields: {},
      latitude: 2.5 + (i * 0.015),
      longitude: 97.0 + (i * 0.015),
      locationText: `Aceh Zone ${i + 1}`,
      moderationStatus: [ModerationStatus.PENDING, ModerationStatus.APPROVED, ModerationStatus.UNDER_REVIEW][i % 3],
    })),

    // ─── Manila Typhoon reports (15 reports)
    ...Array.from({ length: 15 }, (_, i) => ({
      id: `report-manila-${i + 1}`,
      crisisId: CRISES[3].id,
      damageLevel: [DamageLevel.MINIMAL, DamageLevel.PARTIAL, DamageLevel.COMPLETE][i % 3],
      infraType: [InfraType.RESIDENTIAL, InfraType.GOVERNMENT, InfraType.COMMUNITY][i % 3],
      infraName: `Manila Building ${i + 1}`,
      crisisType: CrisisType.HURRICANE_CYCLONE,
      hasDebris: true,
      collectedAt: new Date(Date.parse("2025-09-15T00:00:00.000Z") + i * 3600000),
      description: `Typhoon damage report #${i + 1}`,
      electricityCondition: [ElectricityCondition.SEVERE_DAMAGE, ElectricityCondition.COMPLETELY_DESTROYED][i % 2],
      healthServicesFunctioning: [HealthServicesFunctioning.PARTIALLY_FUNCTIONAL, HealthServicesFunctioning.NOT_FUNCTIONING][i % 2],
      pressingNeeds: [[PressingNeed.SHELTER_REPAIR, PressingNeed.FOOD_WATER], [PressingNeed.HEALTHCARE_MEDICINES]][(i % 2)],
      extraFields: {},
      latitude: 14.4 + (i * 0.01),
      longitude: 120.9 + (i * 0.01),
      locationText: `Manila District ${i + 1}`,
      moderationStatus: [ModerationStatus.APPROVED, ModerationStatus.FLAGGED, ModerationStatus.REJECTED][i % 3],
    })),

    // ─── California Wildfire reports (12 reports)
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `report-ca-wildfire-${i + 1}`,
      crisisId: CRISES[4].id,
      damageLevel: [DamageLevel.PARTIAL, DamageLevel.COMPLETE][i % 2],
      infraType: [InfraType.RESIDENTIAL, InfraType.PUBLIC_RECREATION, InfraType.UTILITY][i % 3],
      infraName: `CA Zone ${i + 1}`,
      crisisType: CrisisType.WILDFIRE,
      hasDebris: true,
      collectedAt: new Date(Date.parse("2025-10-20T00:00:00.000Z") + i * 3600000),
      description: `Wildfire impact assessment #${i + 1}`,
      electricityCondition: [ElectricityCondition.SEVERE_DAMAGE, ElectricityCondition.COMPLETELY_DESTROYED][i % 2],
      healthServicesFunctioning: [HealthServicesFunctioning.PARTIALLY_FUNCTIONAL, HealthServicesFunctioning.LARGELY_DISRUPTED][i % 2],
      pressingNeeds: [[PressingNeed.SHELTER_REPAIR], [PressingNeed.CASH_ASSISTANCE]][(i % 2)],
      extraFields: {},
      latitude: 39.7 + (i * 0.05),
      longitude: -121.0 + (i * 0.05),
      locationText: `Cal Fire Zone ${i + 1}`,
      moderationStatus: [ModerationStatus.APPROVED, ModerationStatus.PENDING][i % 2],
    })),
  ];

  for (const reportData of sampleReports) {
    await prisma.report.upsert({
      where: { id: reportData.id },
      create: reportData,
      update: {
        damageLevel: reportData.damageLevel,
        infraType: reportData.infraType,
        infraName: reportData.infraName,
        crisisType: reportData.crisisType,
        hasDebris: reportData.hasDebris,
        collectedAt: reportData.collectedAt,
        description: reportData.description,
        electricityCondition: reportData.electricityCondition,
        healthServicesFunctioning: reportData.healthServicesFunctioning,
        pressingNeeds: reportData.pressingNeeds,
        extraFields: reportData.extraFields,
        latitude: reportData.latitude,
        longitude: reportData.longitude,
        locationText: reportData.locationText,
        moderationStatus: reportData.moderationStatus,
        deletedAt: null,
      },
    });
  }

  // Seed audit trail for report-antakya-highway showing realistic moderation history
  const analystId = "analyst-seed-user";
  const highwayReportId = "report-antakya-highway";
  const baseTime = new Date("2024-02-10T08:20:00.000Z");

  // Audit entry 1: Flagged for verification
  await prisma.auditLog.upsert({
    where: { id: "audit-highway-001" },
    create: {
      id: "audit-highway-001",
      reportId: highwayReportId,
      action: AuditAction.REPORT_MODERATION_UPDATED,
      actorId: analystId,
      previousValue: { moderationStatus: ModerationStatus.PENDING },
      newValue: { moderationStatus: ModerationStatus.FLAGGED, reason: "Bridge damage claims need field verification" },
      createdAt: new Date(baseTime.getTime() + 3600000), // 1 hour later
    },
    update: {},
  });

  // Audit entry 2: Changed to needs more info
  await prisma.auditLog.upsert({
    where: { id: "audit-highway-002" },
    create: {
      id: "audit-highway-002",
      reportId: highwayReportId,
      action: AuditAction.REPORT_MODERATION_UPDATED,
      actorId: analystId,
      previousValue: { moderationStatus: ModerationStatus.FLAGGED },
      newValue: { moderationStatus: ModerationStatus.UNDER_REVIEW, reason: "Requested photos from reporter" },
      createdAt: new Date(baseTime.getTime() + 7200000), // 2 hours later
    },
    update: {},
  });

  // Audit entry 3: Changed to approved after verification
  await prisma.auditLog.upsert({
    where: { id: "audit-highway-003" },
    create: {
      id: "audit-highway-003",
      reportId: highwayReportId,
      action: AuditAction.REPORT_MODERATION_UPDATED,
      actorId: analystId,
      previousValue: { moderationStatus: ModerationStatus.UNDER_REVIEW },
      newValue: { moderationStatus: ModerationStatus.APPROVED, reason: "Photos verified - complete damage confirmed" },
      createdAt: new Date(baseTime.getTime() + 14400000), // 4 hours later
    },
    update: {},
  });

  return crisisId;
}
