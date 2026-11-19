import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max);
const phone = z.string().trim().min(3).max(40).regex(/^[+\d\s().-]+$/).refine((value) => value.replace(/\D/g, "").length >= 3, "Enter a valid phone number");
const optionalPhone = z.union([z.literal(""), phone]);
const skills = z.array(text(80).transform((value) => value.toLowerCase())).max(30).transform((values) => [...new Set(values)]);
const dateTime = z.string().datetime({ offset: true });

export const EnrollSchema = z.object({
  phone, location: text(200), skills,
  bio: optionalText(2000).default(""), emergencyContactName: optionalText(100).default(""),
  emergencyContactPhone: optionalPhone.default(""),
}).strict();
export const ProfileUpdateSchema = z.object({
  name: text(100).optional(), phone: phone.optional(), location: text(200).optional(), skills: skills.optional(),
  bio: optionalText(2000).optional(), emergencyContactName: optionalText(100).optional(), emergencyContactPhone: optionalPhone.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide a profile field to update");
export const AvailabilitySchema = z.object({ availability: z.enum(["AVAILABLE", "BUSY", "OFFLINE"]) }).strict();
export const RespondSchema = z.object({ decision: z.enum(["ACCEPT", "DECLINE"]) }).strict();
export const ProgressSchema = z.object({ progress: z.number().int().min(0).max(99), notes: optionalText(2000).optional() }).strict();
export const CompletionSchema = z.object({ summary: text(4000), hours: z.number().min(0.25).max(24).refine((value) => Number.isInteger(value * 4), "Report hours in quarter-hour increments") }).strict();
export const CheckInSchema = z.object({
  status: z.enum(["SAFE", "NEED_HELP"]), notes: optionalText(2000).default(""),
  latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(),
}).strict().refine((value) => (value.latitude !== undefined) === (value.longitude !== undefined), "Provide both coordinates");
export const VerificationSchema = z.object({ verificationStatus: z.enum(["PENDING", "VERIFIED", "REJECTED"]) }).strict();
export const CreateTaskSchema = z.object({
  title: text(160), description: text(4000), location: text(200), requiredSkills: skills.default([]),
  requiresVerification: z.boolean().default(true), capacity: z.number().int().min(1).max(200).default(1),
  startsAt: dateTime.optional(), endsAt: dateTime.optional(),
}).strict().refine((value) => !value.startsAt || !value.endsAt || new Date(value.startsAt) < new Date(value.endsAt), "Task end must be after its start");
export const AssignSchema = z.object({ volunteerId: z.string().uuid() }).strict();
export const ReviewSchema = z.object({ decision: z.enum(["APPROVE", "RETURN"]), notes: optionalText(2000).optional() }).strict().refine((value) => value.decision !== "RETURN" || !!value.notes, "Explain why the completion report needs changes");
export const ShiftSchema = z.object({
  volunteerId: z.string().uuid(), title: text(160), location: text(200), startsAt: dateTime, endsAt: dateTime,
}).strict().refine((value) => new Date(value.startsAt) < new Date(value.endsAt), "Shift end must be after its start").refine((value) => new Date(value.endsAt).getTime() - new Date(value.startsAt).getTime() <= 48 * 3600000, "A shift cannot exceed 48 hours");

export type EnrollInput = z.infer<typeof EnrollSchema>;
export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type ShiftInput = z.infer<typeof ShiftSchema>;
