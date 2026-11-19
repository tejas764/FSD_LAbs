import { BadRequestException, Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@thallesp/nestjs-better-auth";
import { SkipThrottle, Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { z } from "zod";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AssignSchema, AvailabilitySchema, CheckInSchema, CompletionSchema, CreateTaskSchema, EnrollSchema, ProfileUpdateSchema, ProgressSchema, RespondSchema, ReviewSchema, ShiftSchema, VerificationSchema } from "./volunteers.dto";
import { VolunteersService } from "./volunteers.service";

type AuthRequest = { user?: { id?: string; sub?: string } };
function identity(request: AuthRequest) {
  const userId = request.user?.id ?? request.user?.sub;
  if (!userId) throw new UnauthorizedException("Sign in to your volunteer account.");
  return userId;
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestException(result.error.issues.map((issue) => `${issue.path.join(".") || "Request"}: ${issue.message}`).join("; "));
  return result.data;
}

@ApiTags("volunteers")
@Controller("volunteers")
@UseGuards(AuthGuard, ThrottlerGuard)
@SkipThrottle({ "crisis-write": true })
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class VolunteersController {
  constructor(@Inject(VolunteersService) private readonly volunteers: VolunteersService) {}

  @Post("enroll")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Enroll the authenticated account as a volunteer; verification remains pending" })
  async enroll(@Req() req: AuthRequest, @Body() body: unknown) {
    return { success: true, data: await this.volunteers.enroll(identity(req), parse(EnrollSchema, body)) };
  }

  @Get("me")
  async me(@Req() req: AuthRequest) { return { success: true, data: await this.volunteers.me(identity(req)) }; }

  @Patch("me")
  async updateProfile(@Req() req: AuthRequest, @Body() body: unknown) {
    return { success: true, data: await this.volunteers.updateProfile(identity(req), parse(ProfileUpdateSchema, body)) };
  }

  @Patch("availability")
  async availability(@Req() req: AuthRequest, @Body() body: unknown) {
    return { success: true, data: await this.volunteers.setAvailability(identity(req), parse(AvailabilitySchema, body).availability) };
  }

  @Get("tasks")
  async tasks(@Req() req: AuthRequest) { return { success: true, data: await this.volunteers.eligibleTasks(identity(req)) }; }

  @Post("tasks/:id/accept")
  async acceptTask(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) taskId: string) {
    return { success: true, data: await this.volunteers.acceptTask(identity(req), taskId) };
  }

  @Post("assignments/:id/respond")
  async respond(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) assignmentId: string, @Body() body: unknown) {
    return { success: true, data: await this.volunteers.respond(identity(req), assignmentId, parse(RespondSchema, body).decision) };
  }

  @Patch("assignments/:id/progress")
  async progress(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) assignmentId: string, @Body() body: unknown) {
    const input = parse(ProgressSchema, body);
    return { success: true, data: await this.volunteers.progress(identity(req), assignmentId, input.progress, input.notes) };
  }

  @Post("assignments/:id/complete")
  async complete(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) assignmentId: string, @Body() body: unknown) {
    const input = parse(CompletionSchema, body);
    return { success: true, data: await this.volunteers.complete(identity(req), assignmentId, input.summary, input.hours) };
  }

  @Post("check-ins")
  async checkIn(@Req() req: AuthRequest, @Body() body: unknown) {
    return { success: true, data: await this.volunteers.checkIn(identity(req), parse(CheckInSchema, body)) };
  }

  @Get("admin/overview")
  @UseGuards(RolesGuard)
  @Roles("admin")
  async overview() { return { success: true, data: await this.volunteers.adminOverview() }; }

  @Patch("admin/profiles/:id/verification")
  @UseGuards(RolesGuard)
  @Roles("admin")
  async verification(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) profileId: string, @Body() body: unknown) {
    return { success: true, data: await this.volunteers.verify(identity(req), profileId, parse(VerificationSchema, body).verificationStatus) };
  }

  @Post("admin/tasks")
  @UseGuards(RolesGuard)
  @Roles("admin")
  async createTask(@Req() req: AuthRequest, @Body() body: unknown) {
    return { success: true, data: await this.volunteers.createTask(identity(req), parse(CreateTaskSchema, body)) };
  }

  @Post("admin/tasks/:id/assign")
  @UseGuards(RolesGuard)
  @Roles("admin")
  async assign(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) taskId: string, @Body() body: unknown) {
    return { success: true, data: await this.volunteers.assign(identity(req), taskId, parse(AssignSchema, body).volunteerId) };
  }

  @Post("admin/assignments/:id/review")
  @UseGuards(RolesGuard)
  @Roles("admin")
  async review(@Req() req: AuthRequest, @Param("id", new ParseUUIDPipe()) assignmentId: string, @Body() body: unknown) {
    const input = parse(ReviewSchema, body);
    return { success: true, data: await this.volunteers.review(identity(req), assignmentId, input.decision, input.notes) };
  }

  @Post("admin/shifts")
  @UseGuards(RolesGuard)
  @Roles("admin")
  async shift(@Req() req: AuthRequest, @Body() body: unknown) {
    return { success: true, data: await this.volunteers.createShift(identity(req), parse(ShiftSchema, body)) };
  }
}
