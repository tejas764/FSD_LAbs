import { z } from "zod";
import { isOfflineMode } from "@/lib/offline/mode";

export const verificationStatuses = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
] as const;
export const availabilityStatuses = ["AVAILABLE", "BUSY", "OFFLINE"] as const;
export const assignmentStatuses = [
  "OFFERED",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETION_SUBMITTED",
  "COMPLETED",
  "DECLINED",
] as const;
export const VolunteerProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  bio: z.string().nullable().optional(),
  skills: z.array(z.string()),
  emergencyContactName: z.string().nullable().optional(),
  emergencyContactPhone: z.string().nullable().optional(),
  verificationStatus: z.enum(verificationStatuses),
  availability: z.enum(availabilityStatuses),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const VolunteerTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  location: z.string(),
  requiredSkills: z.array(z.string()),
  requiresVerification: z.boolean(),
  capacity: z.number(),
  status: z.enum(["OPEN", "CLOSED"]),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  remainingCapacity: z.number().optional(),
});
export const VolunteerAssignmentSchema = z.object({
  id: z.string(),
  volunteerId: z.string(),
  taskId: z.string(),
  status: z.enum(assignmentStatuses),
  progress: z.number(),
  progressNotes: z.string().nullable().optional(),
  completionSummary: z.string().nullable().optional(),
  submittedHours: z.number().nullable().optional(),
  verifiedHours: z.number().nullable().optional(),
  reviewNote: z.string().nullable().optional(),
  assignedAt: z.string(),
  acceptedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  task: VolunteerTaskSchema,
});
export const VolunteerShiftSchema = z.object({
  id: z.string(),
  volunteerId: z.string(),
  title: z.string(),
  location: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  createdAt: z.string(),
});
export const VolunteerCheckInSchema = z.object({
  id: z.string(),
  volunteerId: z.string(),
  status: z.enum(["SAFE", "NEED_HELP"]),
  notes: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  createdAt: z.string(),
});
export const VolunteerDashboardSchema = z.object({
  profile: VolunteerProfileSchema,
  stats: z.object({
    assignedTasks: z.number(),
    upcomingShifts: z.number(),
    completedTasks: z.number(),
    verifiedHours: z.number(),
  }),
  assignments: z.array(VolunteerAssignmentSchema),
  shifts: z.array(VolunteerShiftSchema),
  history: z.array(VolunteerAssignmentSchema),
  checkIns: z.array(VolunteerCheckInSchema),
});
export type VolunteerProfile = z.infer<typeof VolunteerProfileSchema>;
export type VolunteerTask = z.infer<typeof VolunteerTaskSchema>;
export type VolunteerAssignment = z.infer<typeof VolunteerAssignmentSchema>;
export type VolunteerShift = z.infer<typeof VolunteerShiftSchema>;
export type VolunteerDashboard = z.infer<typeof VolunteerDashboardSchema>;
export type VolunteerAvailability = (typeof availabilityStatuses)[number];
export type VolunteerProfileInput = {
  name?: string;
  phone: string;
  location: string;
  skills: string[];
  bio: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

export class VolunteerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "VolunteerApiError";
  }
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  method = "GET",
  body?: unknown,
): Promise<T> {
  if (isOfflineMode())
    throw new VolunteerApiError(
      0,
      "Volunteer records require online mode. Reconnect or select online mode, then refresh your workspace.",
    );
  let response: Response;
  try {
    response = await fetch(`/api/v1/volunteers${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      ...(body !== undefined
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
  } catch {
    throw new VolunteerApiError(
      0,
      "The volunteer service could not be reached. Check your connection and retry; your action has not been confirmed.",
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z
      .object({
        error: z
          .union([
            z.string(),
            z.object({
              message: z.union([z.string(), z.array(z.string())]).optional(),
            }),
          ])
          .optional(),
        message: z.union([z.string(), z.array(z.string())]).optional(),
      })
      .safeParse(payload);
    const source = error.success
      ? typeof error.data.error === "string"
        ? error.data.error
        : (error.data.error?.message ?? error.data.message)
      : undefined;
    throw new VolunteerApiError(
      response.status,
      source
        ? Array.isArray(source)
          ? source.join(" ")
          : source
        : response.status === 401
          ? "Your session has expired. Please sign in again."
          : "The action could not be completed. Refresh your dashboard and retry.",
    );
  }
  const parsed = z
    .object({ success: z.literal(true), data: schema })
    .safeParse(payload);
  if (!parsed.success)
    throw new VolunteerApiError(
      502,
      "The service returned an unexpected response. Refresh to check the latest status before trying again.",
    );
  return parsed.data.data;
}

const anyData = z.unknown();
export const volunteerApi = {
  dashboard: () => request("/me", VolunteerDashboardSchema),
  eligibleTasks: () => request("/tasks", z.array(VolunteerTaskSchema)),
  enroll: (profile: VolunteerProfileInput) => {
    const enrollment = { ...profile };
    delete enrollment.name;
    return request("/enroll", anyData, "POST", enrollment);
  },
  updateProfile: (profile: VolunteerProfileInput) =>
    request("/me", anyData, "PATCH", profile),
  availability: (availability: VolunteerAvailability) =>
    request("/availability", anyData, "PATCH", { availability }),
  acceptTask: (id: string) =>
    request(`/tasks/${encodeURIComponent(id)}/accept`, anyData, "POST", {}),
  respond: (id: string, decision: "ACCEPT" | "DECLINE") =>
    request(`/assignments/${encodeURIComponent(id)}/respond`, anyData, "POST", {
      decision,
    }),
  progress: (id: string, progress: number, notes: string) =>
    request(
      `/assignments/${encodeURIComponent(id)}/progress`,
      anyData,
      "PATCH",
      { progress, notes },
    ),
  complete: (id: string, summary: string, hours: number) =>
    request(
      `/assignments/${encodeURIComponent(id)}/complete`,
      anyData,
      "POST",
      { summary, hours },
    ),
  checkIn: (body: {
    status: "SAFE" | "NEED_HELP";
    notes: string;
    latitude?: number;
    longitude?: number;
  }) => request("/check-ins", anyData, "POST", body),
};

export function volunteerError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";
}
export function volunteerStatusLabel(status: string) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
