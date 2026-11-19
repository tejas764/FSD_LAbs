"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  Activity,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  HeartHandshake,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";
import {
  VolunteerAssignmentSchema,
  VolunteerCheckInSchema,
  VolunteerProfileSchema,
  VolunteerShiftSchema,
  VolunteerTaskSchema,
  volunteerStatusLabel,
  type VolunteerProfile,
  type VolunteerTask,
} from "@/lib/volunteer-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import styles from "./page.module.css";

const PersonSchema = z.object({
  id: z.string(),
  userId: z.string(),
  user: z.object({
    id: z.string(),
    name: z.string().nullable(),
    email: z.string(),
  }),
});
const AdminAssignmentSchema = VolunteerAssignmentSchema.extend({
  volunteer: PersonSchema,
});
const OverviewSchema = z.object({
  profiles: z.array(VolunteerProfileSchema),
  tasks: z.array(VolunteerTaskSchema),
  assignments: z.array(AdminAssignmentSchema),
  shifts: z.array(VolunteerShiftSchema.extend({ volunteer: PersonSchema })),
  checkIns: z.array(VolunteerCheckInSchema.extend({ volunteer: PersonSchema })),
});
type Overview = z.infer<typeof OverviewSchema>;
type AdminAssignment = z.infer<typeof AdminAssignmentSchema>;
type Editor =
  | { kind: "task" }
  | { kind: "shift" }
  | { kind: "assign"; task: VolunteerTask }
  | { kind: "verification"; profile: VolunteerProfile }
  | { kind: "review"; assignment: AdminAssignment };

async function adminRequest(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/volunteers/admin${path}`, {
      method,
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
  } catch {
    throw new Error(
      "The volunteer service could not be reached. No action has been confirmed; check your connection and retry.",
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  const envelope = z
    .object({
      success: z.boolean().optional(),
      data: z.unknown().optional(),
      message: z.union([z.string(), z.array(z.string())]).optional(),
      error: z
        .union([
          z.string(),
          z.object({
            message: z.union([z.string(), z.array(z.string())]).optional(),
          }),
        ])
        .optional(),
    })
    .safeParse(payload);
  if (!response.ok) {
    const message = envelope.success
      ? typeof envelope.data.error === "string"
        ? envelope.data.error
        : (envelope.data.error?.message ?? envelope.data.message)
      : undefined;
    throw new Error(
      response.status === 403
        ? "Coordinator access is required for volunteer management."
        : response.status === 401
          ? "Your session has expired. Sign in again before managing volunteers."
          : message
            ? Array.isArray(message)
              ? message.join(" ")
              : message
            : "This action could not be completed. Refresh the page and retry.",
    );
  }
  if (!envelope.success || envelope.data.success !== true)
    throw new Error(
      "The service returned an unexpected response. Refresh before trying again.",
    );
  return envelope.data.data;
}

function formatDate(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not scheduled";
}
function skillsFrom(value: FormDataEntryValue | null) {
  return [
    ...new Set(
      String(value ?? "")
        .split(",")
        .map((skill) => skill.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
function dateFrom(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return text ? new Date(text).toISOString() : undefined;
}
function eligiblePeople(task: VolunteerTask, data: Overview) {
  return data.profiles.filter(
    (profile) =>
      profile.availability === "AVAILABLE" &&
      profile.verificationStatus !== "REJECTED" &&
      (!task.requiresVerification ||
        profile.verificationStatus === "VERIFIED") &&
      task.requiredSkills.every((skill) =>
        profile.skills.some(
          (candidate) => candidate.toLowerCase() === skill.toLowerCase(),
        ),
      ) &&
      !data.assignments.some(
        (assignment) =>
          assignment.taskId === task.id &&
          assignment.volunteerId === profile.id,
      ),
  );
}

export default function VolunteerCoordinationPage() {
  const { data: session, isPending } = useSession();
  const isAdmin = session?.user?.role?.trim().toLowerCase() === "admin";
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewNote, setReviewNote] = useState("");

  const load = useCallback(async () => {
    if (!isAdmin) return false;
    setLoading(true);
    try {
      const result = OverviewSchema.safeParse(await adminRequest("/overview"));
      if (!result.success)
        throw new Error(
          "The service returned unexpected volunteer data. Please refresh or contact support.",
        );
      setData(result.data);
      setError("");
      return true;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Volunteer data could not be loaded.",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);
  useEffect(() => {
    if (!isPending) {
      if (isAdmin) void load();
      else setLoading(false);
    }
  }, [isPending, isAdmin, load]);

  const reviews = useMemo(
    () =>
      data?.assignments.filter(
        (assignment) => assignment.status === "COMPLETION_SUBMITTED",
      ) ?? [],
    [data],
  );
  const filteredProfiles = useMemo(
    () =>
      data?.profiles.filter((profile) =>
        `${profile.name} ${profile.email} ${profile.location} ${profile.skills.join(" ")}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ) ?? [],
    [data, query],
  );

  function open(next: Editor) {
    setEditor(next);
    setEditorError("");
    setReviewNote("");
  }
  async function mutate(
    path: string,
    method: string,
    body: unknown,
    message: string,
  ) {
    if (busy) return;
    setBusy(true);
    setEditorError("");
    setNotice("");
    try {
      await adminRequest(path, method, body);
      setEditor(null);
      const refreshed = await load();
      setNotice(
        `${message}${refreshed ? "" : " Refresh the page to see the latest list."}`,
      );
    } catch (failure) {
      setEditorError(
        failure instanceof Error
          ? failure.message
          : "This change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const startsAt = dateFrom(form.get("startsAt")),
        endsAt = dateFrom(form.get("endsAt"));
      if (startsAt && endsAt && startsAt >= endsAt) {
        setEditorError("Task end must be after its start.");
        return;
      }
      void mutate(
        "/tasks",
        "POST",
        {
          title: String(form.get("title") ?? "").trim(),
          description: String(form.get("description") ?? "").trim(),
          location: String(form.get("location") ?? "").trim(),
          requiredSkills: skillsFrom(form.get("requiredSkills")),
          requiresVerification: form.get("requiresVerification") === "on",
          capacity: Number(form.get("capacity")),
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {}),
        },
        "Task created.",
      );
    } catch {
      setEditorError("Check the selected dates and try again.");
    }
  }
  function createShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const startsAt = dateFrom(form.get("startsAt")),
        endsAt = dateFrom(form.get("endsAt"));
      if (!startsAt || !endsAt || startsAt >= endsAt) {
        setEditorError("Select a shift end after its start.");
        return;
      }
      void mutate(
        "/shifts",
        "POST",
        {
          volunteerId: String(form.get("volunteerId") ?? ""),
          title: String(form.get("title") ?? "").trim(),
          location: String(form.get("location") ?? "").trim(),
          startsAt,
          endsAt,
        },
        "Shift scheduled.",
      );
    } catch {
      setEditorError("Check the selected dates and try again.");
    }
  }

  if (isPending)
    return (
      <div className="response-page">
        <p role="status">Checking coordinator access…</p>
      </div>
    );
  if (!isAdmin)
    return (
      <div className="response-page">
        <div className="page-heading">
          <div>
            <p className="eyebrow">VOLUNTEER COORDINATION</p>
            <h1>Coordinator access required</h1>
            <p>
              This workspace is available to administrators. Volunteer accounts
              can manage their own work from the volunteer dashboard.
            </p>
          </div>
        </div>
        <a className="text-link" href="/volunteer">
          Open volunteer dashboard
        </a>
      </div>
    );

  return (
    <div className={`response-page ${styles.page}`}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="tiny-dot" /> COORDINATOR WORKSPACE
          </p>
          <h1>Good people. Meaningful action.</h1>
          <p>
            Verify volunteers, organise work, and review the contribution behind
            every hour.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            void load();
          }}
          disabled={loading || busy}
        >
          <RefreshCw
            aria-hidden="true"
            className={loading ? "animate-spin" : ""}
          />
          Refresh
        </Button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
          {data ? " The last loaded overview remains visible." : ""}
        </p>
      )}
      <p className="save-notice" role="status">
        {notice}
      </p>
      {loading && !data && <p role="status">Loading volunteer coordination…</p>}
      {!loading && !data && (
        <div className="response-card">
          <div className={styles.empty}>
            <Users aria-hidden="true" />
            <h2>The overview could not be loaded.</h2>
            <p>
              Check your connection and refresh. No volunteer data is shown
              until it is returned by the service.
            </p>
          </div>
        </div>
      )}
      {data && (
        <>
          <section
            className={styles.stats}
            aria-label="Volunteer coordination overview"
          >
            {[
              {
                label: "Volunteers in view",
                value: data.profiles.length,
                icon: Users,
                tone: "mint",
              },
              {
                label: "Awaiting verification",
                value: data.profiles.filter(
                  (profile) => profile.verificationStatus === "PENDING",
                ).length,
                icon: ShieldCheck,
                tone: "lavender",
              },
              {
                label: "Reports to review",
                value: reviews.length,
                icon: ClipboardList,
                tone: "coral",
              },
              {
                label: "Verified hours in view",
                value: data.assignments
                  .reduce(
                    (sum, assignment) =>
                      sum +
                      (assignment.status === "COMPLETED"
                        ? (assignment.verifiedHours ?? 0)
                        : 0),
                    0,
                  )
                  .toFixed(2),
                icon: Clock3,
                tone: "blue",
              },
            ].map((stat) => (
              <article className="response-card" key={stat.label}>
                <span className={`feature-icon ${stat.tone}`}>
                  <stat.icon aria-hidden="true" />
                </span>
                <div>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </div>
              </article>
            ))}
          </section>
          <Tabs defaultValue="volunteers">
            <TabsList className={styles.tabs}>
              <TabsTrigger value="volunteers">
                <Users aria-hidden="true" />
                Volunteers
              </TabsTrigger>
              <TabsTrigger value="tasks">
                <ClipboardList aria-hidden="true" />
                Tasks
              </TabsTrigger>
              <TabsTrigger value="reviews">
                <Check aria-hidden="true" />
                Completion reviews
                {reviews.length > 0 && (
                  <span className="count-pill">{reviews.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="shifts">
                <CalendarDays aria-hidden="true" />
                Shifts
              </TabsTrigger>
              <TabsTrigger value="safety">
                <HeartHandshake aria-hidden="true" />
                Safety check-ins
              </TabsTrigger>
            </TabsList>
            <TabsContent value="volunteers">
              <div className={styles.toolbar}>
                <div>
                  <h2>Volunteer directory</h2>
                  <p>
                    Verification decisions are made by an administrator after
                    reviewing the volunteer.
                  </p>
                </div>
                <Input
                  aria-label="Search volunteers"
                  placeholder="Search name, location, skills…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className={styles.cardGrid}>
                {filteredProfiles.map((profile) => (
                  <article
                    key={profile.id}
                    className={`response-card ${styles.personCard}`}
                  >
                    <div className={styles.personHeading}>
                      <span className={styles.avatar}>
                        {profile.name.slice(0, 1).toUpperCase()}
                      </span>
                      <div>
                        <h3>{profile.name}</h3>
                        <p>{profile.email}</p>
                      </div>
                    </div>
                    <div className={styles.badges}>
                      <span
                        className={
                          profile.verificationStatus === "VERIFIED"
                            ? styles.goodBadge
                            : styles.badge
                        }
                      >
                        {volunteerStatusLabel(profile.verificationStatus)}
                      </span>
                      <span className={styles.badge}>
                        {volunteerStatusLabel(profile.availability)}
                      </span>
                    </div>
                    <p className={styles.location}>
                      <MapPin aria-hidden="true" />
                      {profile.location}
                    </p>
                    <p className={styles.skills}>
                      {profile.skills.length
                        ? profile.skills.join(" · ")
                        : "No skills listed"}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => open({ kind: "verification", profile })}
                      disabled={busy || profile.userId === session?.user.id}
                    >
                      Review verification
                    </Button>
                    {profile.userId === session?.user.id && (
                      <p className={styles.smallNote}>
                        Another administrator must verify your profile.
                      </p>
                    )}
                  </article>
                ))}
              </div>
              {!filteredProfiles.length && (
                <Empty
                  title={
                    data.profiles.length
                      ? "No volunteers match your search."
                      : "No volunteers have enrolled yet."
                  }
                  text="Registered volunteers appear here after completing their volunteer profile."
                />
              )}
            </TabsContent>
            <TabsContent value="tasks">
              <div className={styles.toolbar}>
                <div>
                  <h2>Response tasks</h2>
                  <p>
                    Create useful work, then offer a place to an eligible
                    volunteer.
                  </p>
                </div>
                <Button onClick={() => open({ kind: "task" })}>
                  <Plus aria-hidden="true" />
                  Create task
                </Button>
              </div>
              <div className={styles.cardGrid}>
                {data.tasks.map((task) => (
                  <article
                    className={`response-card ${styles.taskCard}`}
                    key={task.id}
                  >
                    <div className={styles.badges}>
                      <span className={styles.badge}>
                        {volunteerStatusLabel(task.status)}
                      </span>
                      <span className={styles.badge}>
                        {task.remainingCapacity ?? 0} / {task.capacity} places
                        open
                      </span>
                    </div>
                    <h3>{task.title}</h3>
                    <p className={styles.bodyText}>{task.description}</p>
                    <p className={styles.location}>
                      <MapPin aria-hidden="true" />
                      {task.location}
                    </p>
                    <p className={styles.smallNote}>
                      {task.startsAt
                        ? `${formatDate(task.startsAt)} — ${formatDate(task.endsAt)}`
                        : task.endsAt
                          ? `Until ${formatDate(task.endsAt)}`
                          : "Dates not set"}
                    </p>
                    <p className={styles.skills}>
                      {task.requiredSkills.length
                        ? `Skills: ${task.requiredSkills.join(", ")}`
                        : "No specific skill required"}
                    </p>
                    <p className={styles.smallNote}>
                      {task.requiresVerification
                        ? "Verified volunteers required"
                        : "Open to pending and verified volunteers"}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => open({ kind: "assign", task })}
                      disabled={
                        busy ||
                        task.status !== "OPEN" ||
                        (task.remainingCapacity ?? 0) < 1 ||
                        (!!task.endsAt &&
                          new Date(task.endsAt).getTime() <= Date.now())
                      }
                    >
                      Offer assignment
                    </Button>
                  </article>
                ))}
              </div>
              {!data.tasks.length && (
                <Empty
                  title="Your first task starts here."
                  text="Create a task with a location, clear instructions, and the skills it needs."
                />
              )}
            </TabsContent>
            <TabsContent value="reviews">
              <div className={styles.toolbar}>
                <div>
                  <h2>Completion reports</h2>
                  <p>
                    Only approved reports add verified hours to a volunteer’s
                    record.
                  </p>
                </div>
              </div>
              <div className={styles.cardGrid}>
                {reviews.map((assignment) => (
                  <article
                    className={`response-card ${styles.taskCard}`}
                    key={assignment.id}
                  >
                    <span className={styles.badge}>Awaiting review</span>
                    <h3>{assignment.task.title}</h3>
                    <p className={styles.bodyText}>
                      {assignment.completionSummary}
                    </p>
                    <p className={styles.personName}>
                      {assignment.volunteer.user.name ||
                        assignment.volunteer.user.email}
                    </p>
                    <p className={styles.smallNote}>
                      {assignment.submittedHours} hours submitted ·{" "}
                      {formatDate(assignment.completedAt)}
                    </p>
                    <Button
                      onClick={() => open({ kind: "review", assignment })}
                      disabled={
                        busy || assignment.volunteer.userId === session?.user.id
                      }
                    >
                      Review completion
                    </Button>
                    {assignment.volunteer.userId === session?.user.id && (
                      <p className={styles.smallNote}>
                        Another administrator must review your hours.
                      </p>
                    )}
                  </article>
                ))}
              </div>
              {!reviews.length && (
                <Empty
                  title="No reports waiting for review."
                  text="Volunteers submit their summary and hours after finishing an assignment."
                />
              )}
            </TabsContent>
            <TabsContent value="shifts">
              <div className={styles.toolbar}>
                <div>
                  <h2>Volunteer shifts</h2>
                  <p>
                    Schedule work in the volunteer’s local plan. Overlapping
                    shifts are rejected by the service.
                  </p>
                </div>
                <Button
                  onClick={() => open({ kind: "shift" })}
                  disabled={!data.profiles.length}
                >
                  <Plus aria-hidden="true" />
                  Schedule shift
                </Button>
              </div>
              <div className={styles.list}>
                {data.shifts.map((shift) => (
                  <article
                    className={`response-card ${styles.shiftRow}`}
                    key={shift.id}
                  >
                    <span className="feature-icon blue">
                      <CalendarDays aria-hidden="true" />
                    </span>
                    <div>
                      <h3>{shift.title}</h3>
                      <p>
                        {shift.volunteer.user.name ||
                          shift.volunteer.user.email}{" "}
                        · {shift.location}
                      </p>
                      <p>
                        {formatDate(shift.startsAt)} —{" "}
                        {formatDate(shift.endsAt)}
                      </p>
                    </div>
                    <span className={styles.badge}>
                      {new Date(shift.endsAt).getTime() < Date.now()
                        ? "Past"
                        : "Scheduled"}
                    </span>
                  </article>
                ))}
              </div>
              {!data.shifts.length && (
                <Empty
                  title="No shifts scheduled."
                  text="Choose a volunteer, location, and time to create a shift."
                />
              )}
            </TabsContent>
            <TabsContent value="safety">
              <div className={styles.toolbar}>
                <div>
                  <h2>Safety check-ins</h2>
                  <p>
                    Latest volunteer updates. These records do not automatically
                    dispatch emergency services.
                  </p>
                </div>
              </div>
              <div className={styles.list}>
                {data.checkIns.map((checkIn) => (
                  <article
                    className={`response-card ${styles.checkInRow} ${checkIn.status === "NEED_HELP" ? styles.helpRow : ""}`}
                    key={checkIn.id}
                  >
                    <span
                      className={`feature-icon ${checkIn.status === "NEED_HELP" ? "coral" : "mint"}`}
                    >
                      <HeartHandshake aria-hidden="true" />
                    </span>
                    <div>
                      <div className={styles.checkInHeading}>
                        <h3>
                          {checkIn.volunteer.user.name ||
                            checkIn.volunteer.user.email}
                        </h3>
                        <span
                          className={
                            checkIn.status === "NEED_HELP"
                              ? styles.helpBadge
                              : styles.goodBadge
                          }
                        >
                          {checkIn.status === "NEED_HELP"
                            ? "Assistance requested"
                            : "Safe"}
                        </span>
                      </div>
                      <p className={styles.bodyText}>
                        {checkIn.notes || "No additional note."}
                      </p>
                      <p className={styles.smallNote}>
                        {formatDate(checkIn.createdAt)}
                      </p>
                      {checkIn.latitude != null &&
                        checkIn.longitude != null && (
                          <a
                            className="text-link"
                            target="_blank"
                            rel="noopener noreferrer"
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${checkIn.latitude},${checkIn.longitude}`)}`}
                          >
                            View attached location
                          </a>
                        )}
                    </div>
                  </article>
                ))}
              </div>
              {!data.checkIns.length && (
                <Empty
                  title="No safety check-ins yet."
                  text="Check-ins saved by volunteers will appear here when the service receives them."
                />
              )}
            </TabsContent>
          </Tabs>
          <p className={styles.bottomNote}>
            The overview shows up to 500 volunteers, tasks, assignments, and
            shifts, and the latest 200 check-ins. Refresh to retrieve new
            updates.
          </p>
        </>
      )}

      <Dialog
        open={!!editor}
        onOpenChange={(next) => {
          if (!next && !busy) setEditor(null);
        }}
      >
        <DialogContent className={styles.editor}>
          <DialogHeader>
            <DialogTitle>
              {editor?.kind === "task"
                ? "Create a response task"
                : editor?.kind === "shift"
                  ? "Schedule a volunteer shift"
                  : editor?.kind === "assign"
                    ? "Offer an assignment"
                    : editor?.kind === "verification"
                      ? "Review volunteer verification"
                      : "Review a completion report"}
            </DialogTitle>
            <DialogDescription>
              {editor?.kind === "verification"
                ? "Confirm the volunteer’s details using your verification process before recording a decision."
                : editor?.kind === "review"
                  ? "Review the work summary and submitted hours. Approval adds these hours to the volunteer’s verified total."
                  : "Changes are saved to the volunteer service after confirmation."}
            </DialogDescription>
          </DialogHeader>
          {editorError && (
            <p role="alert" className="form-error">
              {editorError}
            </p>
          )}
          {editor?.kind === "task" && (
            <form className={styles.form} onSubmit={createTask}>
              <Field label="Task title" id="admin-task-title">
                <Input
                  id="admin-task-title"
                  name="title"
                  required
                  maxLength={160}
                  disabled={busy}
                />
              </Field>
              <Field
                label="Instructions and safety information"
                id="admin-task-description"
              >
                <Textarea
                  id="admin-task-description"
                  name="description"
                  required
                  maxLength={4000}
                  rows={4}
                  disabled={busy}
                />
              </Field>
              <Field label="Task location" id="admin-task-location">
                <Input
                  id="admin-task-location"
                  name="location"
                  required
                  maxLength={200}
                  disabled={busy}
                />
              </Field>
              <Field
                label="Required skills (comma separated)"
                id="admin-task-skills"
              >
                <Input
                  id="admin-task-skills"
                  name="requiredSkills"
                  placeholder="e.g. logistics, first aid"
                  maxLength={2400}
                  disabled={busy}
                />
              </Field>
              <Field label="Volunteer places" id="admin-task-capacity">
                <Input
                  id="admin-task-capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  max={200}
                  step={1}
                  defaultValue={1}
                  required
                  disabled={busy}
                />
              </Field>
              <div className={styles.twoColumns}>
                <Field label="Starts at (optional)" id="admin-task-start">
                  <Input
                    id="admin-task-start"
                    name="startsAt"
                    type="datetime-local"
                    disabled={busy}
                  />
                </Field>
                <Field label="Ends at (optional)" id="admin-task-end">
                  <Input
                    id="admin-task-end"
                    name="endsAt"
                    type="datetime-local"
                    disabled={busy}
                  />
                </Field>
              </div>
              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  name="requiresVerification"
                  defaultChecked
                  disabled={busy}
                />
                Require coordinator-verified volunteers
              </label>
              <p className={styles.smallNote}>
                Dates use this browser’s local timezone.
              </p>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Create task"}
              </Button>
            </form>
          )}
          {editor?.kind === "shift" && data && (
            <form className={styles.form} onSubmit={createShift}>
              <Field label="Volunteer" id="admin-shift-volunteer">
                <select
                  id="admin-shift-volunteer"
                  name="volunteerId"
                  required
                  disabled={busy}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose a volunteer
                  </option>
                  {data.profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} · {profile.email}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Shift title" id="admin-shift-title">
                <Input
                  id="admin-shift-title"
                  name="title"
                  maxLength={160}
                  required
                  disabled={busy}
                />
              </Field>
              <Field label="Shift location" id="admin-shift-location">
                <Input
                  id="admin-shift-location"
                  name="location"
                  maxLength={200}
                  required
                  disabled={busy}
                />
              </Field>
              <div className={styles.twoColumns}>
                <Field label="Shift starts" id="admin-shift-start">
                  <Input
                    id="admin-shift-start"
                    name="startsAt"
                    type="datetime-local"
                    required
                    disabled={busy}
                  />
                </Field>
                <Field label="Shift ends" id="admin-shift-end">
                  <Input
                    id="admin-shift-end"
                    name="endsAt"
                    type="datetime-local"
                    required
                    disabled={busy}
                  />
                </Field>
              </div>
              <p className={styles.smallNote}>
                Dates use this browser’s local timezone. A shift can span at
                most 48 hours.
              </p>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Schedule shift"}
              </Button>
            </form>
          )}
          {editor?.kind === "assign" && data && (
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void mutate(
                  `/tasks/${encodeURIComponent(editor.task.id)}/assign`,
                  "POST",
                  { volunteerId: String(form.get("volunteerId") ?? "") },
                  "Assignment offered. The volunteer can accept or decline it.",
                );
              }}
            >
              <h3>{editor.task.title}</h3>
              <p className={styles.bodyText}>
                The list includes available volunteers with the required skills
                and verification. The service checks eligibility again when you
                submit.
              </p>
              <Field label="Eligible volunteer" id="admin-assign-volunteer">
                <select
                  id="admin-assign-volunteer"
                  name="volunteerId"
                  required
                  defaultValue=""
                  disabled={busy}
                >
                  <option value="" disabled>
                    Choose a volunteer
                  </option>
                  {eligiblePeople(editor.task, data).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} · {profile.location}
                    </option>
                  ))}
                </select>
              </Field>
              {!eligiblePeople(editor.task, data).length && (
                <p className={styles.smallNote}>
                  No eligible volunteers in the current overview. Check
                  availability, required skills, and verification, then refresh.
                </p>
              )}
              <Button
                type="submit"
                disabled={busy || !eligiblePeople(editor.task, data).length}
              >
                {busy ? "Saving…" : "Send assignment offer"}
              </Button>
            </form>
          )}
          {editor?.kind === "verification" && (
            <div className={styles.form}>
              <h3>{editor.profile.name}</h3>
              <dl className={styles.profileDetails}>
                <dt>Email</dt>
                <dd>{editor.profile.email}</dd>
                <dt>Phone</dt>
                <dd>{editor.profile.phone}</dd>
                <dt>Location</dt>
                <dd>{editor.profile.location}</dd>
                <dt>Skills</dt>
                <dd>{editor.profile.skills.join(", ") || "None listed"}</dd>
                <dt>Bio</dt>
                <dd>{editor.profile.bio || "None provided"}</dd>
                <dt>Current verification</dt>
                <dd>
                  {volunteerStatusLabel(editor.profile.verificationStatus)}
                </dd>
              </dl>
              <div className={styles.dialogActions}>
                {(["PENDING", "REJECTED", "VERIFIED"] as const).map(
                  (status) => (
                    <Button
                      key={status}
                      variant={status === "VERIFIED" ? "default" : "outline"}
                      disabled={
                        busy || editor.profile.verificationStatus === status
                      }
                      onClick={() => {
                        void mutate(
                          `/profiles/${encodeURIComponent(editor.profile.id)}/verification`,
                          "PATCH",
                          { verificationStatus: status },
                          `Verification set to ${volunteerStatusLabel(status).toLowerCase()}.`,
                        );
                      }}
                    >
                      {status === "VERIFIED"
                        ? "Verify volunteer"
                        : status === "REJECTED"
                          ? "Reject verification"
                          : "Return to pending"}
                    </Button>
                  ),
                )}
              </div>
            </div>
          )}
          {editor?.kind === "review" && (
            <div className={styles.form}>
              <h3>{editor.assignment.task.title}</h3>
              <p className={styles.personName}>
                {editor.assignment.volunteer.user.name ||
                  editor.assignment.volunteer.user.email}
              </p>
              <p className={styles.reportSummary}>
                {editor.assignment.completionSummary}
              </p>
              <p>
                <strong>
                  {editor.assignment.submittedHours} hours submitted
                </strong>
              </p>
              <Field label="Review notes" id="admin-review-notes">
                <Textarea
                  id="admin-review-notes"
                  maxLength={2000}
                  rows={3}
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Explain any changes needed before approval."
                  disabled={busy}
                />
              </Field>
              <div className={styles.dialogActions}>
                <Button
                  variant="outline"
                  disabled={busy || !reviewNote.trim()}
                  onClick={() => {
                    void mutate(
                      `/assignments/${encodeURIComponent(editor.assignment.id)}/review`,
                      "POST",
                      { decision: "RETURN", notes: reviewNote.trim() },
                      "Report returned to the volunteer for updates.",
                    );
                  }}
                >
                  Return for updates
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    void mutate(
                      `/assignments/${encodeURIComponent(editor.assignment.id)}/review`,
                      "POST",
                      {
                        decision: "APPROVE",
                        ...(reviewNote.trim()
                          ? { notes: reviewNote.trim() }
                          : {}),
                      },
                      "Completion approved and hours verified.",
                    );
                  }}
                >
                  Approve {editor.assignment.submittedHours} hours
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className={`response-card ${styles.empty}`}>
      <Activity aria-hidden="true" />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
