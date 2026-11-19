import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type VolunteerAssignment, type VolunteerProfile, type VolunteerTask } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateTaskInput, EnrollInput, ProfileUpdateInput, ShiftInput } from "./volunteers.dto";
import { effectiveVerificationStatus } from "./verified-identity";

type Tx = Prisma.TransactionClient;
type Status = VolunteerAssignment["status"];
const ACTIVE: Status[] = ["OFFERED", "ACCEPTED", "IN_PROGRESS", "COMPLETION_SUBMITTED"];
const USER_SELECT = { id: true, name: true, email: true } as const;
const ASSIGNMENT_INCLUDE = { task: true } as const;

@Injectable()
export class VolunteersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async enroll(userId: string, input: EnrollInput) {
    const profile = await this.prisma.volunteerProfile.upsert({ where: { userId }, create: { userId, ...input }, update: {}, include: { user: { select: USER_SELECT } } });
    return this.profileView(profile);
  }

  private profileView(profile: VolunteerProfile & { user: { name: string | null; email: string } }) {
    const { user, ...fields } = profile;
    return { ...fields, verificationStatus: effectiveVerificationStatus(profile), name: user.name ?? "Volunteer", email: user.email };
  }

  private async requireProfile(db: Tx | PrismaService, userId: string) {
    const profile = await db.volunteerProfile.findUnique({ where: { userId }, include: { user: { select: USER_SELECT } } });
    if (!profile) throw new NotFoundException("Create your volunteer profile before opening the workspace.");
    return profile;
  }

  private async lockProfile(db: Tx, profileId: string) {
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "VolunteerProfile" WHERE "id" = ${profileId} FOR UPDATE`);
    const profile = await db.volunteerProfile.findUnique({ where: { id: profileId }, include: { user: { select: USER_SELECT } } });
    if (!profile) throw new NotFoundException("Volunteer profile not found.");
    return profile;
  }

  private async lockTask(db: Tx, taskId: string) {
    await db.$queryRaw(Prisma.sql`SELECT "id" FROM "VolunteerTask" WHERE "id" = ${taskId} FOR UPDATE`);
    const task = await db.volunteerTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException("Task not found.");
    return task;
  }

  private checkEligibility(profile: VolunteerProfile & { user: { name: string | null } }, task: VolunteerTask) {
    if (profile.availability !== "AVAILABLE") throw new ConflictException("Set your availability to Available before accepting assignments.");
    if (task.status !== "OPEN" || (task.endsAt && task.endsAt.getTime() <= Date.now())) throw new ConflictException("This task is closed or has ended.");
    if (profile.verificationStatus === "REJECTED" || (task.requiresVerification && effectiveVerificationStatus(profile) !== "VERIFIED")) throw new ForbiddenException("Coordinator verification is required for this task.");
    const skills = new Set(profile.skills.map((skill) => skill.toLowerCase()));
    if (!task.requiredSkills.every((skill) => skills.has(skill.toLowerCase()))) throw new ForbiddenException("This task requires skills that are not listed on your profile.");
  }

  async me(userId: string) {
    const profile = await this.prisma.volunteerProfile.findUnique({ where: { userId }, include: { user: { select: USER_SELECT } } });
    if (!profile) throw new NotFoundException("Create your volunteer profile before opening the workspace.");
    const [assignments, shifts, checkIns] = await Promise.all([
      this.prisma.volunteerAssignment.findMany({ where: { volunteerId: profile.id }, include: ASSIGNMENT_INCLUDE, orderBy: { assignedAt: "desc" }, take: 500 }),
      this.prisma.volunteerShift.findMany({ where: { volunteerId: profile.id, endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 200 }),
      this.prisma.volunteerCheckIn.findMany({ where: { volunteerId: profile.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    ]);
    const [completedTasks, hours] = await Promise.all([
      this.prisma.volunteerAssignment.count({ where: { volunteerId: profile.id, status: "COMPLETED" } }),
      this.prisma.volunteerAssignment.aggregate({ where: { volunteerId: profile.id, status: "COMPLETED" }, _sum: { verifiedHours: true } }),
    ]);
    return { profile: this.profileView(profile), stats: { assignedTasks: assignments.filter((assignment) => ACTIVE.includes(assignment.status)).length, upcomingShifts: shifts.length, completedTasks, verifiedHours: hours._sum.verifiedHours ?? 0 }, assignments: assignments.filter((assignment) => ACTIVE.includes(assignment.status)), shifts, history: assignments, checkIns };
  }

  async updateProfile(userId: string, input: ProfileUpdateInput) {
    return this.prisma.$transaction(async (db) => {
      const original = await this.requireProfile(db, userId);
      const profile = await this.lockProfile(db, original.id);
      const { name, ...fields } = input;
      const currentUser = name !== undefined ? await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }) : null;
      const nameChanged = name !== undefined && currentUser?.name !== name;
      if (nameChanged) await db.user.update({ where: { id: userId }, data: { name } });
      // A change to skills or identity contact details returns verification to review.
      const changedCredentials = (fields.skills !== undefined && JSON.stringify([...fields.skills].sort()) !== JSON.stringify([...profile.skills].sort())) || (fields.phone !== undefined && fields.phone !== profile.phone) || nameChanged;
      const saved = await db.volunteerProfile.update({ where: { id: profile.id }, data: { ...fields, ...(changedCredentials ? { verificationStatus: "PENDING", verifiedBy: null, verifiedAt: null, verifiedName: null } : {}) }, include: { user: { select: USER_SELECT } } });
      return this.profileView(saved);
    });
  }

  async setAvailability(userId: string, availability: VolunteerProfile["availability"]) {
    const profile = await this.requireProfile(this.prisma, userId);
    return this.prisma.volunteerProfile.update({ where: { id: profile.id }, data: { availability } });
  }

  async eligibleTasks(userId: string) {
    const profile = await this.requireProfile(this.prisma, userId);
    if (profile.availability !== "AVAILABLE" || profile.verificationStatus === "REJECTED") return [];
    const tasks = await this.prisma.volunteerTask.findMany({
      where: { status: "OPEN", OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }], assignments: { none: { volunteerId: profile.id } }, ...(effectiveVerificationStatus(profile) !== "VERIFIED" ? { requiresVerification: false } : {}) },
      include: { _count: { select: { assignments: { where: { status: { not: "DECLINED" } } } } } },
      orderBy: [{ createdAt: "desc" }], take: 500,
    });
    const skills = new Set(profile.skills.map((skill) => skill.toLowerCase()));
    return tasks.filter((task) => task._count.assignments < task.capacity && task.requiredSkills.every((skill) => skills.has(skill.toLowerCase()))).map(({ _count, ...task }) => ({ ...task, remainingCapacity: task.capacity - _count.assignments }));
  }

  async acceptTask(userId: string, taskId: string) {
    return this.prisma.$transaction(async (db) => {
      const original = await this.requireProfile(db, userId);
      const task = await this.lockTask(db, taskId);
      const profile = await this.lockProfile(db, original.id);
      const existing = await db.volunteerAssignment.findUnique({ where: { taskId_volunteerId: { taskId, volunteerId: profile.id } }, include: ASSIGNMENT_INCLUDE });
      if (existing) {
        if (["ACCEPTED", "IN_PROGRESS", "COMPLETION_SUBMITTED", "COMPLETED"].includes(existing.status)) return existing;
        if (existing.status === "OFFERED") {
          this.checkEligibility(profile, task);
          return db.volunteerAssignment.update({ where: { id: existing.id }, data: { status: "ACCEPTED", acceptedAt: new Date() }, include: ASSIGNMENT_INCLUDE });
        }
        throw new ConflictException("You have already declined this task. Ask the coordinator to discuss another assignment.");
      }
      this.checkEligibility(profile, task);
      const count = await db.volunteerAssignment.count({ where: { taskId, status: { not: "DECLINED" } } });
      if (count >= task.capacity) throw new ConflictException("All places on this task have been filled.");
      return db.volunteerAssignment.create({ data: { volunteerId: profile.id, taskId, status: "ACCEPTED", acceptedAt: new Date() }, include: ASSIGNMENT_INCLUDE });
    });
  }

  private async ownAssignment(db: Tx, userId: string, assignmentId: string) {
    const original = await this.requireProfile(db, userId);
    const first = await db.volunteerAssignment.findUnique({ where: { id: assignmentId } });
    if (!first || first.volunteerId !== original.id) throw new NotFoundException("Assignment not found.");
    const task = await this.lockTask(db, first.taskId);
    const profile = await this.lockProfile(db, original.id);
    const assignment = await db.volunteerAssignment.findUniqueOrThrow({ where: { id: assignmentId } });
    return { assignment, profile, task };
  }

  async respond(userId: string, assignmentId: string, decision: "ACCEPT" | "DECLINE") {
    return this.prisma.$transaction(async (db) => {
      const { assignment, profile, task } = await this.ownAssignment(db, userId, assignmentId);
      const next = decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";
      if (assignment.status === next) return db.volunteerAssignment.findUniqueOrThrow({ where: { id: assignment.id }, include: ASSIGNMENT_INCLUDE });
      if (assignment.status !== "OFFERED") throw new ConflictException("Only a pending assignment offer can be accepted or declined.");
      if (decision === "ACCEPT") this.checkEligibility(profile, task);
      return db.volunteerAssignment.update({ where: { id: assignment.id }, data: { status: next, ...(decision === "ACCEPT" ? { acceptedAt: new Date() } : {}) }, include: ASSIGNMENT_INCLUDE });
    });
  }

  async progress(userId: string, assignmentId: string, progress: number, notes?: string) {
    return this.prisma.$transaction(async (db) => {
      const { assignment, profile, task } = await this.ownAssignment(db, userId, assignmentId);
      if (!["ACCEPTED", "IN_PROGRESS"].includes(assignment.status)) throw new ConflictException("Accept the assignment before updating its progress.");
      if (task.requiresVerification && effectiveVerificationStatus(profile) !== "VERIFIED") throw new ForbiddenException("Your verification needs coordinator review before task work can continue.");
      if (task.startsAt && task.startsAt.getTime() > Date.now()) throw new ConflictException("This task has not started yet.");
      if (progress < assignment.progress) throw new BadRequestException("Progress cannot decrease. Explain corrections in your progress notes.");
      return db.volunteerAssignment.update({ where: { id: assignment.id }, data: { progress, status: "IN_PROGRESS", ...(notes !== undefined ? { progressNotes: notes } : {}) }, include: ASSIGNMENT_INCLUDE });
    });
  }

  async complete(userId: string, assignmentId: string, summary: string, hours: number) {
    return this.prisma.$transaction(async (db) => {
      const { assignment, profile, task } = await this.ownAssignment(db, userId, assignmentId);
      if (["COMPLETION_SUBMITTED", "COMPLETED"].includes(assignment.status) && assignment.completionSummary === summary && assignment.submittedHours === hours) return db.volunteerAssignment.findUniqueOrThrow({ where: { id: assignment.id }, include: ASSIGNMENT_INCLUDE });
      if (!["ACCEPTED", "IN_PROGRESS"].includes(assignment.status)) throw new ConflictException("This assignment is not open for a completion report.");
      if (task.requiresVerification && effectiveVerificationStatus(profile) !== "VERIFIED") throw new ForbiddenException("Your verification needs coordinator review before completion can be submitted.");
      if (task.startsAt && task.startsAt.getTime() > Date.now()) throw new ConflictException("This task has not started yet.");
      return db.volunteerAssignment.update({ where: { id: assignment.id }, data: { status: "COMPLETION_SUBMITTED", progress: 100, completionSummary: summary, submittedHours: hours, verifiedHours: 0, reviewNote: null, completedAt: new Date(), reviewedAt: null, reviewedBy: null }, include: ASSIGNMENT_INCLUDE });
    });
  }

  async checkIn(userId: string, input: { status: "SAFE" | "NEED_HELP"; notes: string; latitude?: number; longitude?: number }) {
    const profile = await this.requireProfile(this.prisma, userId);
    return this.prisma.volunteerCheckIn.create({ data: { volunteerId: profile.id, ...input } });
  }

  async adminOverview() {
    const [profiles, tasks, assignments, shifts, checkIns] = await Promise.all([
      this.prisma.volunteerProfile.findMany({ include: { user: { select: USER_SELECT } }, orderBy: { createdAt: "desc" }, take: 500 }),
      this.prisma.volunteerTask.findMany({ include: { _count: { select: { assignments: { where: { status: { not: "DECLINED" } } } } } }, orderBy: { createdAt: "desc" }, take: 500 }),
      this.prisma.volunteerAssignment.findMany({ include: { task: true, volunteer: { include: { user: { select: USER_SELECT } } } }, orderBy: { assignedAt: "desc" }, take: 500 }),
      this.prisma.volunteerShift.findMany({ include: { volunteer: { include: { user: { select: USER_SELECT } } } }, orderBy: { startsAt: "asc" }, take: 500 }),
      this.prisma.volunteerCheckIn.findMany({ include: { volunteer: { include: { user: { select: USER_SELECT } } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    ]);
    return { profiles: profiles.map((profile) => ({ ...profile, verificationStatus: effectiveVerificationStatus(profile), name: profile.user.name ?? "Volunteer", email: profile.user.email })), tasks: tasks.map(({ _count, ...task }) => ({ ...task, remainingCapacity: Math.max(0, task.capacity - _count.assignments) })), assignments, shifts, checkIns };
  }

  async verify(actorId: string, profileId: string, verificationStatus: VolunteerProfile["verificationStatus"]) {
    return this.prisma.$transaction(async (db) => {
      const profile = await this.lockProfile(db, profileId);
      if (profile.userId === actorId) throw new ForbiddenException("A coordinator cannot verify their own volunteer profile.");
      return db.volunteerProfile.update({ where: { id: profileId }, data: { verificationStatus, verifiedBy: actorId, verifiedAt: verificationStatus === "VERIFIED" ? new Date() : null, verifiedName: verificationStatus === "VERIFIED" ? (profile.user.name ?? "") : null } });
    });
  }

  async createTask(actorId: string, input: CreateTaskInput) {
    if (input.endsAt && new Date(input.endsAt).getTime() <= Date.now()) throw new BadRequestException("Task end must be in the future.");
    return this.prisma.volunteerTask.create({ data: { ...input, startsAt: input.startsAt ? new Date(input.startsAt) : null, endsAt: input.endsAt ? new Date(input.endsAt) : null, createdBy: actorId } });
  }

  async assign(actorId: string, taskId: string, volunteerId: string) {
    return this.prisma.$transaction(async (db) => {
      const task = await this.lockTask(db, taskId);
      const profile = await this.lockProfile(db, volunteerId);
      this.checkEligibility(profile, task);
      const existing = await db.volunteerAssignment.findUnique({ where: { taskId_volunteerId: { taskId, volunteerId } }, include: ASSIGNMENT_INCLUDE });
      if (existing) return existing;
      const count = await db.volunteerAssignment.count({ where: { taskId, status: { not: "DECLINED" } } });
      if (count >= task.capacity) throw new ConflictException("All places on this task have been filled.");
      return db.volunteerAssignment.create({ data: { taskId, volunteerId, status: "OFFERED", assignedBy: actorId }, include: ASSIGNMENT_INCLUDE });
    });
  }

  async review(actorId: string, assignmentId: string, decision: "APPROVE" | "RETURN", notes?: string) {
    return this.prisma.$transaction(async (db) => {
      await db.$queryRaw(Prisma.sql`SELECT "id" FROM "VolunteerAssignment" WHERE "id" = ${assignmentId} FOR UPDATE`);
      const assignment = await db.volunteerAssignment.findUnique({ where: { id: assignmentId }, include: { volunteer: true } });
      if (!assignment) throw new NotFoundException("Assignment not found.");
      if (assignment.volunteer.userId === actorId) throw new ForbiddenException("A coordinator cannot approve their own volunteer hours.");
      if (assignment.status !== "COMPLETION_SUBMITTED") throw new ConflictException("Only submitted completion reports can be reviewed.");
      if (assignment.submittedHours === null || assignment.submittedHours <= 0) throw new ConflictException("This completion report does not contain valid hours.");
      return db.volunteerAssignment.update({ where: { id: assignmentId }, data: { status: decision === "APPROVE" ? "COMPLETED" : "IN_PROGRESS", verifiedHours: decision === "APPROVE" ? assignment.submittedHours : 0, progress: decision === "APPROVE" ? 100 : 99, reviewNote: notes ?? null, reviewedBy: actorId, reviewedAt: new Date(), ...(decision === "RETURN" ? { completedAt: null } : {}) }, include: ASSIGNMENT_INCLUDE });
    });
  }

  async createShift(actorId: string, input: ShiftInput) {
    if (new Date(input.endsAt).getTime() <= Date.now()) throw new BadRequestException("Shift end must be in the future.");
    return this.prisma.$transaction(async (db) => {
      await this.lockProfile(db, input.volunteerId);
      const startsAt = new Date(input.startsAt), endsAt = new Date(input.endsAt);
      const overlap = await db.volunteerShift.findFirst({ where: { volunteerId: input.volunteerId, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
      if (overlap) throw new ConflictException("This volunteer already has an overlapping shift.");
      return db.volunteerShift.create({ data: { ...input, startsAt, endsAt, createdBy: actorId } });
    });
  }
}
