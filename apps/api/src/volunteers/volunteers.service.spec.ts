import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { VolunteerAssignment, VolunteerProfile, VolunteerTask } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { VolunteersService } from "./volunteers.service";
import { CompletionSchema, EnrollSchema, ProfileUpdateSchema, ReviewSchema, ShiftSchema } from "./volunteers.dto";

const profile = (): VolunteerProfile & { user: { id: string; name: string; email: string } } => ({ id: "profile-a", userId: "user-a", phone: "+91 9000000000", location: "Test city", skills: ["logistics"], bio: "", emergencyContactName: "", emergencyContactPhone: "", verificationStatus: "VERIFIED", verifiedBy: "admin-a", verifiedAt: new Date(), verifiedName: "Volunteer", availability: "AVAILABLE", createdAt: new Date(), updatedAt: new Date(), user: { id: "user-a", name: "Volunteer", email: "person@example.test" } });
const task = (): VolunteerTask => ({ id: "task-a", title: "Coordinate supplies", description: "Follow the shift briefing.", location: "Warehouse", requiredSkills: ["logistics"], requiresVerification: true, capacity: 1, status: "OPEN", startsAt: null, endsAt: null, createdBy: "admin-a", createdAt: new Date(), updatedAt: new Date() });
const assignment = (): VolunteerAssignment => ({ id: "assignment-a", taskId: "task-a", volunteerId: "profile-a", status: "ACCEPTED", progress: 20, progressNotes: "", completionSummary: null, submittedHours: null, verifiedHours: 0, reviewNote: null, assignedBy: null, reviewedBy: null, assignedAt: new Date(), acceptedAt: new Date(), completedAt: null, reviewedAt: null, updatedAt: new Date() });

describe("volunteer permissions and task lifecycle", () => {
  let db: {
    $queryRaw: jest.Mock; $transaction: jest.Mock;
    volunteerProfile: { findUnique: jest.Mock; update: jest.Mock; upsert: jest.Mock };
    volunteerTask: { findUnique: jest.Mock };
    volunteerAssignment: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock };
    volunteerShift: { findFirst: jest.Mock; create: jest.Mock };
    user: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
  };
  let service: VolunteersService;

  beforeEach(() => {
    db = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: "locked" }]), $transaction: jest.fn(),
      volunteerProfile: { findUnique: jest.fn().mockResolvedValue(profile()), update: jest.fn(), upsert: jest.fn() },
      volunteerTask: { findUnique: jest.fn().mockResolvedValue(task()) },
      volunteerAssignment: { findUnique: jest.fn().mockResolvedValue(null), findUniqueOrThrow: jest.fn().mockResolvedValue(assignment()), count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue(assignment()), update: jest.fn().mockImplementation(async ({ data }) => ({ ...assignment(), ...data })) },
      volunteerShift: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() }, user: { update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({ name: "Volunteer" }) },
    };
    db.$transaction.mockImplementation(async (run) => run(db));
    service = new VolunteersService(db as unknown as PrismaService);
  });

  it("refuses another volunteer's assignment without persisting any change", async () => {
    db.volunteerAssignment.findUnique.mockResolvedValue({ ...assignment(), volunteerId: "other-profile" });
    await expect(service.progress("user-a", "assignment-a", 50, "done")).rejects.toThrow(NotFoundException);
    expect(db.volunteerAssignment.update).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "REJECTED"] as const)("blocks %s verification from accepting a verified task", async (verificationStatus) => {
    db.volunteerProfile.findUnique.mockResolvedValue({ ...profile(), verificationStatus });
    await expect(service.acceptTask("user-a", "task-a")).rejects.toThrow(ForbiddenException);
    expect(db.volunteerAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects a task for which the volunteer lacks required skills", async () => {
    db.volunteerTask.findUnique.mockResolvedValue({ ...task(), requiredSkills: ["water-rescue"] });
    await expect(service.acceptTask("user-a", "task-a")).rejects.toThrow(ForbiddenException);
  });

  it("fails closed if an external account rename has not yet invalidated the persisted verification flag", async () => {
    db.volunteerProfile.findUnique.mockResolvedValue({ ...profile(), user: { id: "user-a", name: "Changed identity", email: "person@example.test" } });
    await expect(service.acceptTask("user-a", "task-a")).rejects.toThrow(ForbiddenException);
    expect(db.volunteerAssignment.create).not.toHaveBeenCalled();
  });

  it.each(["BUSY", "OFFLINE"] as const)("requires opting into availability before accepting while %s", async (availability) => {
    db.volunteerProfile.findUnique.mockResolvedValue({ ...profile(), availability });
    await expect(service.acceptTask("user-a", "task-a")).rejects.toThrow(ConflictException);
  });

  it("does not allocate a place after another claim fills capacity", async () => {
    db.volunteerAssignment.count.mockResolvedValue(1);
    await expect(service.acceptTask("user-a", "task-a")).rejects.toThrow(ConflictException);
    expect(db.volunteerAssignment.create).not.toHaveBeenCalled();
  });

  it("preserves the accepted assignment on a replay rather than creating another one", async () => {
    db.volunteerAssignment.findUnique.mockResolvedValue(assignment());
    await expect(service.acceptTask("user-a", "task-a")).resolves.toMatchObject({ id: "assignment-a", status: "ACCEPTED" });
    expect(db.volunteerAssignment.create).not.toHaveBeenCalled();
  });

  it("lets an offered volunteer decline while offline without forcing availability", async () => {
    db.volunteerProfile.findUnique.mockResolvedValue({ ...profile(), availability: "OFFLINE" });
    db.volunteerAssignment.findUnique.mockResolvedValue({ ...assignment(), status: "OFFERED" });
    db.volunteerAssignment.findUniqueOrThrow.mockResolvedValue({ ...assignment(), status: "OFFERED" });
    await expect(service.respond("user-a", "assignment-a", "DECLINE")).resolves.toMatchObject({ status: "DECLINED" });
  });

  it("cannot report decreasing progress or complete an unaccepted offer", async () => {
    db.volunteerAssignment.findUnique.mockResolvedValue(assignment());
    await expect(service.progress("user-a", "assignment-a", 10)).rejects.toThrow(BadRequestException);
    db.volunteerAssignment.findUniqueOrThrow.mockResolvedValue({ ...assignment(), status: "OFFERED" });
    await expect(service.complete("user-a", "assignment-a", "Delivered supplies", 2)).rejects.toThrow(ConflictException);
  });

  it("submits completion as unverified hours pending coordinator approval", async () => {
    db.volunteerAssignment.findUnique.mockResolvedValue(assignment());
    await expect(service.complete("user-a", "assignment-a", "Delivered supplies", 2.5)).resolves.toMatchObject({ status: "COMPLETION_SUBMITTED", submittedHours: 2.5, verifiedHours: 0, progress: 100 });
  });

  it("requires an independent coordinator to approve hours", async () => {
    db.volunteerAssignment.findUnique.mockResolvedValue({ ...assignment(), status: "COMPLETION_SUBMITTED", submittedHours: 2, volunteer: profile() });
    await expect(service.review("user-a", "assignment-a", "APPROVE")).rejects.toThrow(ForbiddenException);
    expect(db.volunteerAssignment.update).not.toHaveBeenCalled();
  });

  it("approves only submitted hours and prevents reviewing an already approved report", async () => {
    db.volunteerAssignment.findUnique.mockResolvedValue({ ...assignment(), status: "COMPLETION_SUBMITTED", submittedHours: 2.5, volunteer: profile() });
    await expect(service.review("admin-a", "assignment-a", "APPROVE")).resolves.toMatchObject({ status: "COMPLETED", verifiedHours: 2.5 });
    db.volunteerAssignment.findUnique.mockResolvedValue({ ...assignment(), status: "COMPLETED", submittedHours: 2.5, verifiedHours: 2.5, volunteer: profile() });
    await expect(service.review("admin-a", "assignment-a", "APPROVE")).rejects.toThrow(ConflictException);
  });

  it("returns a completion report for correction without granting hours", async () => {
    db.volunteerAssignment.findUnique.mockResolvedValue({ ...assignment(), status: "COMPLETION_SUBMITTED", submittedHours: 2.5, volunteer: profile() });
    await expect(service.review("admin-a", "assignment-a", "RETURN", "Include the delivery record")).resolves.toMatchObject({ status: "IN_PROGRESS", verifiedHours: 0, progress: 99, reviewNote: "Include the delivery record" });
  });

  it("does not allow coordinators to verify their own volunteer profile", async () => {
    await expect(service.verify("user-a", "profile-a", "VERIFIED")).rejects.toThrow(ForbiddenException);
    expect(db.volunteerProfile.update).not.toHaveBeenCalled();
  });

  it("resets verification after qualifications change", async () => {
    db.volunteerProfile.update.mockImplementation(async ({ data }) => ({ ...profile(), ...data, user: { name: "Volunteer", email: "person@example.test" } }));
    await expect(service.updateProfile("user-a", { skills: ["first aid"] })).resolves.toMatchObject({ skills: ["first aid"], verificationStatus: "PENDING", verifiedBy: null });
  });

  it("preserves verification when only bio changes and the existing name is resent", async () => {
    db.volunteerProfile.update.mockImplementation(async ({ data }) => ({ ...profile(), ...data, user: { name: "Volunteer", email: "person@example.test" } }));
    await expect(service.updateProfile("user-a", { name: "Volunteer", bio: "Updated introduction" })).resolves.toMatchObject({ bio: "Updated introduction", verificationStatus: "VERIFIED" });
  });

  it("blocks overlapping shifts for the same volunteer", async () => {
    db.volunteerShift.findFirst.mockResolvedValue({ id: "shift-existing" });
    const startsAt = new Date(Date.now() + 3600000).toISOString(), endsAt = new Date(Date.now() + 7200000).toISOString();
    await expect(service.createShift("admin-a", { volunteerId: "profile-a", title: "Supply shift", location: "Warehouse", startsAt, endsAt })).rejects.toThrow(ConflictException);
    expect(db.volunteerShift.create).not.toHaveBeenCalled();
  });
});

describe("volunteer input validation", () => {
  it("rejects verification and verified-hours privilege injection into enrollment or profile updates", () => {
    expect(EnrollSchema.safeParse({ phone: "+91 9000000000", location: "City", skills: [], verificationStatus: "VERIFIED" }).success).toBe(false);
    expect(ProfileUpdateSchema.safeParse({ verifiedHours: 100, verificationStatus: "VERIFIED" }).success).toBe(false);
  });
  it.each([0, -1, 25, 1.1, Infinity])("rejects an invalid completion hour claim %s", (hours) => {
    expect(CompletionSchema.safeParse({ summary: "Work done", hours }).success).toBe(false);
  });
  it("requires a reason when a coordinator returns a report", () => {
    expect(ReviewSchema.safeParse({ decision: "RETURN", notes: " " }).success).toBe(false);
  });
  it("requires correctly ordered bounded shifts", () => {
    expect(ShiftSchema.safeParse({ volunteerId: "550e8400-e29b-41d4-a716-446655440001", title: "Shift", location: "Hall", startsAt: "2026-12-01T12:00:00Z", endsAt: "2026-12-01T10:00:00Z" }).success).toBe(false);
  });
});
