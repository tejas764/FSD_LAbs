"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  HeartHandshake,
  History,
  LocateFixed,
  MapPin,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
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
import { useConnectivity } from "@/lib/offline/connectivity";
import {
  availabilityStatuses,
  VolunteerApiError,
  volunteerApi,
  volunteerError,
  volunteerStatusLabel,
  type VolunteerAssignment,
  type VolunteerDashboard,
  type VolunteerProfile,
  type VolunteerTask,
} from "@/lib/volunteer-api";
import {
  readVolunteerProfile,
  VolunteerProfileFields,
} from "./volunteer-profile-fields";

function formatDate(value: string | null | undefined, includeTime = true) {
  if (!value) return "Schedule to be confirmed";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Schedule to be confirmed";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(includeTime
      ? { hour: "numeric", minute: "2-digit" }
      : { year: "numeric" }),
  }).format(date);
}

export function VolunteerWorkspace({
  profileOnly = false,
}: {
  profileOnly?: boolean;
}) {
  const connection = useConnectivity();
  const searchParams = useSearchParams();
  const [data, setData] = useState<VolunteerDashboard | null>(null);
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsEnrollment, setNeedsEnrollment] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("overview");
  const [query, setQuery] = useState("");
  const [completion, setCompletion] = useState<VolunteerAssignment | null>(
    null,
  );
  const [checkInOpen, setCheckInOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [dashboard, catalog] = await Promise.allSettled([
      volunteerApi.dashboard(),
      volunteerApi.eligibleTasks(),
    ]);
    if (dashboard.status === "fulfilled") {
      setData(dashboard.value);
      setNeedsEnrollment(false);
      if (catalog.status === "fulfilled") {
        setTasks(catalog.value);
        setError("");
      } else {
        setTasks([]);
        setError(
          `Your profile loaded, but eligible tasks could not be refreshed. ${volunteerError(catalog.reason)}`,
        );
      }
    } else if (
      dashboard.reason instanceof VolunteerApiError &&
      dashboard.reason.status === 404
    ) {
      setNeedsEnrollment(true);
      setData(null);
      setError("");
    } else {
      setError(volunteerError(dashboard.reason));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const view = searchParams.get("view");
    if (
      view &&
      ["overview", "assignments", "tasks", "shifts", "history"].includes(view)
    )
      setTab(view);
  }, [searchParams]);

  async function act(
    key: string,
    action: () => Promise<unknown>,
    message: string,
  ) {
    if (busy) return false;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(message);
      await refresh();
      return true;
    } catch (failure) {
      setError(volunteerError(failure));
      return false;
    } finally {
      setBusy("");
    }
  }

  const disabled = !!busy || !connection.isOnline;
  const active =
    data?.assignments.filter(
      (assignment) => !["COMPLETED", "DECLINED"].includes(assignment.status),
    ) ?? [];
  const eligible = tasks.filter((task) =>
    [task.title, task.location, task.description, ...task.requiredSkills].some(
      (text) =>
        text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
    ),
  );

  return (
    <div className="response-page volunteer-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            <span className="tiny-dot" /> YOUR VOLUNTEER WORKSPACE
          </p>
          <h1>
            {profileOnly
              ? "The person behind the impact."
              : data
                ? `Good to have you here, ${data.profile.name.split(" ")[0] || "volunteer"}.`
                : "Your next step starts here."}
          </h1>
          <p>
            {profileOnly
              ? "Keep your skills and contact details up to date."
              : "Your assignments, your schedule, and the difference you make."}
          </p>
        </div>
        <div className="volunteer-heading-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void refresh();
            }}
            disabled={!!busy || loading}
          >
            <RefreshCw aria-hidden="true" />
            Refresh
          </Button>
          {!profileOnly && (
            <Button
              type="button"
              onClick={() => setCheckInOpen(true)}
              disabled={!data || disabled}
            >
              <HeartHandshake aria-hidden="true" />
              Safety check-in
            </Button>
          )}
        </div>
      </div>
      {!connection.isOnline && (
        <div className="volunteer-info-note" role="status">
          Volunteer accounts need a connection to load current assignments and
          confirm changes. Reconnect or select online mode to continue. This
          page does not cache your personal records for offline access.
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
          {error.toLowerCase().includes("sign in") && (
            <>
              {" "}
              <Link href="/volunteer/login">Sign in again</Link>
            </>
          )}
        </p>
      )}
      {notice && (
        <p className="volunteer-success-note" role="status">
          <CheckCircle2 aria-hidden="true" />
          {notice}
        </p>
      )}
      {loading ? (
        <div className="volunteer-loading" role="status">
          <RefreshCw aria-hidden="true" className="animate-spin" />
          <p>Opening your volunteer workspace…</p>
        </div>
      ) : needsEnrollment ? (
        <section className="response-card volunteer-onboarding">
          <div className="section-header">
            <div>
              <p className="eyebrow">ONE MORE STEP</p>
              <h2>Complete your volunteer enrollment</h2>
            </div>
            <span className="feature-icon mint">
              <HeartHandshake aria-hidden="true" />
            </span>
          </div>
          <p>
            Your account is ready. Add your volunteer details so a coordinator
            can review your profile and match you to suitable work.
          </p>
          <form
            className="response-form"
            onSubmit={(event) => {
              event.preventDefault();
              const profile = readVolunteerProfile(event.currentTarget);
              void act(
                "enroll",
                () => volunteerApi.enroll(profile),
                "Your volunteer profile has been created and is awaiting coordinator verification.",
              );
            }}
          >
            <VolunteerProfileFields disabled={disabled} />
            <Button type="submit" disabled={disabled}>
              {busy === "enroll" ? "Saving…" : "Complete enrollment"}
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>
        </section>
      ) : !data ? (
        <div className="volunteer-empty">
          <span className="feature-icon coral">
            <RefreshCw aria-hidden="true" />
          </span>
          <h2>Your workspace could not be loaded</h2>
          <p>
            Check your connection and try again. Your saved account and tasks
            remain on the server.
          </p>
          <Button
            type="button"
            onClick={() => {
              void refresh();
            }}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
          {profileOnly ? (
            <div className="volunteer-profile-layout">
              <ProfileSummary profile={data.profile} />
              <section className="response-card">
                <div className="section-header">
                  <div>
                    <p className="eyebrow">KEEP IN TOUCH</p>
                    <h2>Your volunteer profile</h2>
                  </div>
                  <UserRound
                    aria-hidden="true"
                    className="size-5 text-muted-foreground"
                  />
                </div>
                <form
                  key={data.profile.updatedAt}
                  className="response-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const profile = readVolunteerProfile(event.currentTarget);
                    void act(
                      "profile",
                      () => volunteerApi.updateProfile(profile),
                      "Your profile has been saved.",
                    );
                  }}
                >
                  <div className="volunteer-info-note">
                    Your coordinator manages verification. Changing your name,
                    phone, or skills returns your profile to Pending for review.
                  </div>
                  <VolunteerProfileFields
                    profile={data.profile}
                    includeName
                    disabled={disabled}
                  />
                  <Button type="submit" disabled={disabled}>
                    <Save aria-hidden="true" />
                    {busy === "profile" ? "Saving…" : "Save profile"}
                  </Button>
                </form>
              </section>
            </div>
          ) : (
            <>
              <section
                className="volunteer-welcome"
                aria-labelledby="volunteer-welcome-title"
              >
                <div>
                  <span className="hero-kicker">
                    <HeartHandshake aria-hidden="true" /> SHOW UP. HELP OUT.
                    MAKE A DIFFERENCE.
                  </span>
                  <h2 id="volunteer-welcome-title">
                    Every helping hand
                    <br />
                    moves a community <span>forward.</span>
                  </h2>
                  <p>
                    Your skills belong where they can make a difference. Stay
                    available, follow your assignments, and check in with your
                    coordinator.
                  </p>
                </div>
                <div className="volunteer-availability-panel">
                  <span>Your availability</span>
                  <div
            className={`volunteer-availability-current volunteer-is-${data.profile.availability.toLowerCase()}`}
                  >
                    <span className="tiny-dot" />
                    {volunteerStatusLabel(data.profile.availability)}
                  </div>
                  <fieldset disabled={disabled}>
                    <legend className="sr-only">
                      Update volunteer availability
                    </legend>
                    {availabilityStatuses.map((value) => (
                      <button
                        type="button"
                        key={value}
                        aria-pressed={data.profile.availability === value}
                        onClick={() => {
                          void act(
                            "availability",
                            () => volunteerApi.availability(value),
                            `Availability updated to ${value.toLowerCase()}.`,
                          );
                        }}
                        className={
                          data.profile.availability === value ? "selected" : ""
                        }
                      >
                        {volunteerStatusLabel(value)}
                      </button>
                    ))}
                  </fieldset>
                  <small>
                    Use “Available” when you can accept work. Your coordinator
                    sees this status.
                  </small>
                </div>
              </section>
              <section
                className="overview-stats volunteer-stats"
                aria-label="Your volunteer activity"
              >
                {[
                  {
                    icon: ClipboardCheck,
                    tone: "mint",
                    label: "Assigned tasks",
                    value: data.stats.assignedTasks,
                    detail: "Your active assignments",
                  },
                  {
                    icon: CalendarDays,
                    tone: "blue",
                    label: "Upcoming shifts",
                    value: data.stats.upcomingShifts,
                    detail: "Your next scheduled commitments",
                  },
                  {
                    icon: CheckCircle2,
                    tone: "coral",
                    label: "Completed tasks",
                    value: data.stats.completedTasks,
                    detail: "Reviewed and approved",
                  },
                  {
                    icon: Award,
                    tone: "lavender",
                    label: "Verified hours",
                    value: data.stats.verifiedHours.toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    }),
                    detail: "Approved by your coordinator",
                  },
                ].map((item) => (
                  <article className="overview-stat" key={item.label}>
                    <span className={`feature-icon ${item.tone}`}>
                      <item.icon aria-hidden="true" />
                    </span>
                    <div>
                      <span className="stat-label">{item.label}</span>
                      <strong>{item.value}</strong>
                      <span className="stat-detail">{item.detail}</span>
                    </div>
                  </article>
                ))}
              </section>
              <div className="volunteer-dashboard-grid">
                <div className="volunteer-main-column">
                  <Tabs value={tab} onValueChange={setTab}>
                    <TabsList
                      className="volunteer-tabs"
                      aria-label="Volunteer dashboard sections"
                    >
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="assignments">
                        My assignments<span>{active.length}</span>
                      </TabsTrigger>
                      <TabsTrigger value="tasks">Eligible tasks</TabsTrigger>
                      <TabsTrigger value="shifts">Upcoming shifts</TabsTrigger>
                      <TabsTrigger value="history">Task history</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview">
                      <section className="response-card">
                        <div className="section-header">
                          <div>
                            <p className="eyebrow">YOUR NEXT STEPS</p>
                            <h2>Assigned to you</h2>
                          </div>
                          <button
                            type="button"
                            className="text-link"
                            onClick={() => setTab("assignments")}
                          >
                            View all
                            <ArrowRight aria-hidden="true" />
                          </button>
                        </div>
                        {active.length ? (
                          <div className="volunteer-assignment-list">
                            {active.slice(0, 3).map((assignment) => (
                              <AssignmentCard
                                key={`${assignment.id}:${assignment.status}:${assignment.progress}`}
                                assignment={assignment}
                                disabled={disabled}
                                busy={busy}
                                onRespond={(decision) => {
                                  void act(
                                    assignment.id,
                                    () =>
                                      volunteerApi.respond(
                                        assignment.id,
                                        decision,
                                      ),
                                    decision === "ACCEPT"
                                      ? "Assignment accepted. Follow your coordinator’s task instructions."
                                      : "Assignment declined.",
                                  );
                                }}
                                onProgress={(progress, notes) => {
                                  void act(
                                    assignment.id,
                                    () =>
                                      volunteerApi.progress(
                                        assignment.id,
                                        progress,
                                        notes,
                                      ),
                                    "Task progress saved.",
                                  );
                                }}
                                onComplete={() => setCompletion(assignment)}
                              />
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            icon="tasks"
                            title="Room for your next contribution"
                            text="No active assignments yet. Set your availability and explore tasks that match your profile."
                            action={
                              <button
                                type="button"
                                className="text-link"
                                onClick={() => setTab("tasks")}
                              >
                                Explore eligible tasks
                                <ArrowRight aria-hidden="true" />
                              </button>
                            }
                          />
                        )}
                      </section>
                      <ShiftList data={data} />
                    </TabsContent>
                    <TabsContent value="assignments">
                      <section className="response-card">
                        <div className="section-header">
                          <div>
                            <p className="eyebrow">COMMITMENTS THAT COUNT</p>
                            <h2>Your assignments</h2>
                          </div>
                          <span className="count-pill">
                            {active.length} active
                          </span>
                        </div>
                        {active.length ? (
                          <div className="volunteer-assignment-list">
                            {active.map((assignment) => (
                              <AssignmentCard
                                key={`${assignment.id}:${assignment.status}:${assignment.progress}`}
                                assignment={assignment}
                                disabled={disabled}
                                busy={busy}
                                onRespond={(decision) => {
                                  void act(
                                    assignment.id,
                                    () =>
                                      volunteerApi.respond(
                                        assignment.id,
                                        decision,
                                      ),
                                    decision === "ACCEPT"
                                      ? "Assignment accepted."
                                      : "Assignment declined.",
                                  );
                                }}
                                onProgress={(progress, notes) => {
                                  void act(
                                    assignment.id,
                                    () =>
                                      volunteerApi.progress(
                                        assignment.id,
                                        progress,
                                        notes,
                                      ),
                                    "Task progress saved.",
                                  );
                                }}
                                onComplete={() => setCompletion(assignment)}
                              />
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            icon="tasks"
                            title="No active assignments"
                            text="Accepted tasks and offers from your coordinator will appear here."
                          />
                        )}
                      </section>
                    </TabsContent>
                    <TabsContent value="tasks">
                      <section className="response-card">
                        <div className="section-header">
                          <div>
                            <p className="eyebrow">
                              FIND YOUR NEXT CONTRIBUTION
                            </p>
                            <h2>Tasks that fit your profile</h2>
                          </div>
                          <span className="count-pill">
                            {tasks.length} eligible
                          </span>
                        </div>
                        <div className="volunteer-task-search">
                          <Search aria-hidden="true" />
                          <Input
                            aria-label="Search eligible volunteer tasks"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search a task, skill, or location…"
                          />
                        </div>
                        {data.profile.availability !== "AVAILABLE" && (
                          <p className="volunteer-catalog-note">
                            Set your availability to Available before accepting
                            a task.
                          </p>
                        )}
                        {eligible.length ? (
                          <div className="volunteer-task-grid">
                            {eligible.map((task) => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                disabled={
                                  disabled ||
                                  data.profile.availability !== "AVAILABLE"
                                }
                                onAccept={() => {
                                  void act(
                                    task.id,
                                    () => volunteerApi.acceptTask(task.id),
                                    "Task accepted. You can now find it in My assignments.",
                                  );
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <EmptyState
                            icon="people"
                            title={
                              query
                                ? "No matching tasks"
                                : "No eligible tasks right now"
                            }
                            text={
                              query
                                ? "Try another skill, location, or search term."
                                : data.profile.verificationStatus !== "VERIFIED"
                                  ? "Some tasks require coordinator verification. Your skills, verification, availability, and task capacity determine what appears here."
                                  : "Your coordinator can create tasks that match your skills, or offer an assignment directly."
                            }
                          />
                        )}
                      </section>
                    </TabsContent>
                    <TabsContent value="shifts">
                      <ShiftList data={data} />
                    </TabsContent>
                    <TabsContent value="history">
                      <TaskHistory data={data} />
                    </TabsContent>
                  </Tabs>
                </div>
                <aside
                  className="volunteer-side-column"
                  aria-label="Your profile and safety"
                >
                  <ProfileSummary profile={data.profile} />
                  <section className="volunteer-safety-card">
                    <span className="feature-icon coral">
                      <HeartHandshake aria-hidden="true" />
                    </span>
                    <p className="eyebrow">YOUR SAFETY COMES FIRST</p>
                    <h2>
                      A quick check-in.
                      <br />A clearer picture.
                    </h2>
                    <p>
                      Record that you are safe, or flag that you need help. Your
                      coordinator can review the update.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={disabled}
                      onClick={() => setCheckInOpen(true)}
                    >
                      Record a safety check-in
                      <ArrowRight aria-hidden="true" />
                    </Button>
                    {data.checkIns[0] && (
                      <small>
                        Last check-in:{" "}
                        {volunteerStatusLabel(data.checkIns[0].status)} ·{" "}
                        {formatDate(data.checkIns[0].createdAt)}
                      </small>
                    )}
                  </section>
                  <div className="volunteer-hours-note">
                    <ShieldCheck aria-hidden="true" />
                    <p>
                      Reported hours become verified hours only after a
                      coordinator approves your completion report.
                    </p>
                  </div>
                </aside>
              </div>
            </>
          )}
          <CompletionDialog
            assignment={completion}
            disabled={disabled}
            busy={busy}
            onClose={() => setCompletion(null)}
            onSubmit={async (summary, hours) => {
              const saved = await act(
                completion?.id ?? "completion",
                () => volunteerApi.complete(completion!.id, summary, hours),
                "Completion report submitted. Your coordinator will review the task and hours.",
              );
              if (saved) setCompletion(null);
              return saved;
            }}
          />
          <VolunteerSafetyDialog
            open={checkInOpen}
            disabled={disabled}
            onClose={() => setCheckInOpen(false)}
            onSubmit={async (body) => {
              const saved = await act(
                "check-in",
                () => volunteerApi.checkIn(body),
                "Safety check-in recorded. This confirms server storage, not emergency dispatch.",
              );
              if (saved) setCheckInOpen(false);
              return saved;
            }}
          />
        </>
      )}
    </div>
  );
}

function ProfileSummary({ profile }: { profile: VolunteerProfile }) {
  return (
    <section className="response-card volunteer-profile-summary">
      <div className="volunteer-profile-top">
        <span className="volunteer-avatar">
          {profile.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("") || "V"}
        </span>
        <span
          className={`volunteer-verification verification-${profile.verificationStatus.toLowerCase()}`}
        >
          <ShieldCheck aria-hidden="true" />
          {volunteerStatusLabel(profile.verificationStatus)}
        </span>
      </div>
      <h2>{profile.name}</h2>
      <span className="volunteer-profile-role">COMMUNITY VOLUNTEER</span>
      <p>
        <MapPin aria-hidden="true" />
        {profile.location}
      </p>
      <p className="volunteer-profile-email">{profile.email}</p>
      {profile.bio && <p className="volunteer-profile-bio">{profile.bio}</p>}
      <div className="volunteer-skill-tags">
        {profile.skills.length ? (
          profile.skills.map((skill) => <span key={skill}>{skill}</span>)
        ) : (
          <span>No skills added yet</span>
        )}
      </div>
      {profile.verificationStatus !== "VERIFIED" && (
        <p className="volunteer-verification-note">
          {profile.verificationStatus === "REJECTED"
            ? "Your profile is not verified. Contact your coordinator to clarify the review and update your details if needed."
            : "A coordinator will review your details. Tasks that require verification become available after approval."}
        </p>
      )}
      <Link href="/volunteer/profile" className="text-link">
        Manage my profile
        <ArrowUpRight aria-hidden="true" />
      </Link>
    </section>
  );
}

function EmptyState({
  title,
  text,
  action,
  icon,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
  icon: "tasks" | "people" | "calendar";
}) {
  const Icon =
    icon === "tasks"
      ? ClipboardCheck
      : icon === "people"
        ? Users
        : CalendarDays;
  return (
    <div className="volunteer-empty">
      <span className="feature-icon mint">
        <Icon aria-hidden="true" />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function AssignmentCard({
  assignment,
  disabled,
  busy,
  onRespond,
  onProgress,
  onComplete,
}: {
  assignment: VolunteerAssignment;
  disabled: boolean;
  busy: string;
  onRespond: (decision: "ACCEPT" | "DECLINE") => void;
  onProgress: (progress: number, notes: string) => void;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState(assignment.progress);
  const [notes, setNotes] = useState(assignment.progressNotes ?? "");
  const editable =
    assignment.status === "ACCEPTED" || assignment.status === "IN_PROGRESS";
  return (
    <article className="volunteer-assignment">
      <div className="volunteer-assignment-heading">
        <span
          className={`volunteer-task-status status-${assignment.status.toLowerCase()}`}
        >
          {volunteerStatusLabel(assignment.status)}
        </span>
        <small>{formatDate(assignment.task.startsAt)}</small>
      </div>
      <h3>{assignment.task.title}</h3>
      <p className="volunteer-task-location">
        <MapPin aria-hidden="true" />
        {assignment.task.location}
      </p>
      <p className="volunteer-task-description">
        {assignment.task.description}
      </p>
      {assignment.reviewNote && (
        <p className="volunteer-review-note">
          <strong>Coordinator note:</strong> {assignment.reviewNote}
        </p>
      )}
      {assignment.status === "OFFERED" && (
        <div className="volunteer-assignment-actions">
          <Button disabled={disabled} onClick={() => onRespond("ACCEPT")}>
            <Check aria-hidden="true" />
            {busy === assignment.id ? "Saving…" : "Accept assignment"}
          </Button>
          <Button
            disabled={disabled}
            variant="outline"
            onClick={() => onRespond("DECLINE")}
          >
            Decline
          </Button>
        </div>
      )}
      {editable && (
        <form
          className="volunteer-progress-form"
          onSubmit={(event) => {
            event.preventDefault();
            onProgress(progress, notes);
          }}
        >
          <div className="volunteer-progress-heading">
            <Label htmlFor={`progress-${assignment.id}`}>Task progress</Label>
            <strong>{progress}%</strong>
          </div>
          <input
            id={`progress-${assignment.id}`}
            type="range"
            min={assignment.progress}
            max={99}
            step={1}
            value={progress}
            disabled={disabled}
            onChange={(event) => setProgress(Number(event.target.value))}
          />
          <Label
            htmlFor={`progress-notes-${assignment.id}`}
            className="sr-only"
          >
            Progress notes for {assignment.task.title}
          </Label>
          <Textarea
            id={`progress-notes-${assignment.id}`}
            value={notes}
            maxLength={2000}
            rows={2}
            disabled={disabled}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="A short progress update for your coordinator…"
          />
          <div className="volunteer-assignment-actions">
            <Button type="submit" variant="outline" disabled={disabled}>
              <Save aria-hidden="true" />
              Save progress
            </Button>
            <Button type="button" disabled={disabled} onClick={onComplete}>
              <ClipboardCheck aria-hidden="true" />
              Submit completion
            </Button>
          </div>
        </form>
      )}
      {assignment.status === "COMPLETION_SUBMITTED" && (
        <div className="volunteer-submitted-note">
          <Clock3 aria-hidden="true" />
          <span>
            Completion submitted · {assignment.submittedHours ?? 0} reported
            hours. Awaiting coordinator review.
          </span>
        </div>
      )}
    </article>
  );
}

function TaskCard({
  task,
  disabled,
  onAccept,
}: {
  task: VolunteerTask;
  disabled: boolean;
  onAccept: () => void;
}) {
  return (
    <article className="volunteer-catalog-task">
      <div className="volunteer-catalog-task-top">
        <span className="feature-icon mint">
          <ClipboardCheck aria-hidden="true" />
        </span>
        {task.requiresVerification && (
          <span className="volunteer-task-verification">
            <ShieldCheck aria-hidden="true" />
            Verified volunteers
          </span>
        )}
      </div>
      <h3>{task.title}</h3>
      <p className="volunteer-task-location">
        <MapPin aria-hidden="true" />
        {task.location}
      </p>
      <p className="volunteer-task-description">{task.description}</p>
      <div className="volunteer-skill-tags">
        {task.requiredSkills.map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>
      <div className="volunteer-catalog-meta">
        <span>
          <Clock3 aria-hidden="true" />
          {formatDate(task.startsAt)}
        </span>
        {task.remainingCapacity !== undefined && (
          <span>
            <Users aria-hidden="true" />
            {task.remainingCapacity} places available
          </span>
        )}
      </div>
      <Button disabled={disabled} onClick={onAccept}>
        Accept task
        <ArrowRight aria-hidden="true" />
      </Button>
    </article>
  );
}

function ShiftList({ data }: { data: VolunteerDashboard }) {
  return (
    <section className="response-card volunteer-shifts">
      <div className="section-header">
        <div>
          <p className="eyebrow">TIME WELL SPENT</p>
          <h2>Your upcoming shifts</h2>
        </div>
        <CalendarDays
          aria-hidden="true"
          className="size-5 text-muted-foreground"
        />
      </div>
      {data.shifts.length ? (
        <ul>
          {data.shifts.map((shift) => (
            <li key={shift.id}>
              <span className="volunteer-shift-date">
                <strong>{new Date(shift.startsAt).getDate()}</strong>
                <small>
                  {new Date(shift.startsAt).toLocaleDateString(undefined, {
                    month: "short",
                  })}
                </small>
              </span>
              <div>
                <h3>{shift.title}</h3>
                <p>
                  <MapPin aria-hidden="true" />
                  {shift.location}
                </p>
                <small>
                  {formatDate(shift.startsAt)} – {formatDate(shift.endsAt)}
                </small>
              </div>
              <ChevronRight aria-hidden="true" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon="calendar"
          title="No upcoming shifts"
          text="Shifts assigned by your coordinator will appear here with their location and start time."
        />
      )}
    </section>
  );
}

function TaskHistory({ data }: { data: VolunteerDashboard }) {
  return (
    <section className="response-card">
      <div className="section-header">
        <div>
          <p className="eyebrow">YOUR CONTRIBUTIONS, RECORDED</p>
          <h2>Task history</h2>
        </div>
        <History aria-hidden="true" className="size-5 text-muted-foreground" />
      </div>
      {data.history.length ? (
        <div className="volunteer-history-scroll">
          <table className="volunteer-history-table">
            <caption className="sr-only">
              Your assignments and verified volunteer hours
            </caption>
            <thead>
              <tr>
                <th scope="col">Task</th>
                <th scope="col">Status</th>
                <th scope="col">Reported hours</th>
                <th scope="col">Verified hours</th>
                <th scope="col">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((assignment) => (
                <tr key={assignment.id}>
                  <td>
                    <strong>{assignment.task.title}</strong>
                    <small>{assignment.task.location}</small>
                    {assignment.reviewNote && (
                      <small>Review: {assignment.reviewNote}</small>
                    )}
                  </td>
                  <td>
                    <span
                      className={`volunteer-task-status status-${assignment.status.toLowerCase()}`}
                    >
                      {volunteerStatusLabel(assignment.status)}
                    </span>
                  </td>
                  <td>{assignment.submittedHours ?? "—"}</td>
                  <td>
                    {assignment.status === "COMPLETED"
                      ? (assignment.verifiedHours ?? 0)
                      : "—"}
                  </td>
                  <td>{formatDate(assignment.assignedAt, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon="tasks"
          title="Your story is just beginning"
          text="Assignments, completion reviews, and approved volunteer hours will be recorded here."
        />
      )}
    </section>
  );
}

function CompletionDialog({
  assignment,
  disabled,
  busy,
  onClose,
  onSubmit,
}: {
  assignment: VolunteerAssignment | null;
  disabled: boolean;
  busy: string;
  onClose: () => void;
  onSubmit: (summary: string, hours: number) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  return (
    <Dialog
      open={!!assignment}
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
          setError("");
        }
      }}
    >
      <DialogContent className="safety-dialog volunteer-modal">
        <DialogHeader>
          <DialogTitle>Tell us what you completed.</DialogTitle>
          <DialogDescription>
            {assignment?.task.title}. Your coordinator will review this report
            before the task and hours are verified.
          </DialogDescription>
        </DialogHeader>
        <form
          className="volunteer-dialog-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            const summary = String(fields.get("summary") || "").trim();
            const hours = Number(fields.get("hours"));
            if (
              summary.length < 10 ||
              !Number.isFinite(hours) ||
              hours < 0.25 ||
              hours > 24 ||
              !Number.isInteger(hours * 4)
            ) {
              setError(
                "Add a summary of at least 10 characters and between 0.25 and 24 hours in quarter-hour steps.",
              );
              return;
            }
            setError("");
            if (!(await onSubmit(summary, hours)))
              setError(
                "The report could not be submitted. Check the dashboard message and retry.",
              );
          }}
        >
          <div className="form-field">
            <Label htmlFor="completion-summary">Completion summary</Label>
            <Textarea
              id="completion-summary"
              name="summary"
              required
              minLength={10}
              maxLength={4000}
              rows={4}
              placeholder="What did you complete? Include outcomes, handover notes, and any remaining needs."
              disabled={disabled}
            />
          </div>
          <div className="form-field">
            <Label htmlFor="completion-hours">Hours volunteered</Label>
            <Input
              id="completion-hours"
              name="hours"
              type="number"
              required
              min={0.25}
              max={24}
              step={0.25}
              placeholder="e.g. 2.5"
              disabled={disabled}
            />
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <p className="volunteer-field-help">
            Report the time you actually spent. Submitted hours are not verified
            until approved.
          </p>
          <Button type="submit" disabled={disabled}>
            <ClipboardCheck aria-hidden="true" />
            {busy ? "Submitting…" : "Submit completion report"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function VolunteerSafetyDialog({
  open,
  disabled,
  onClose,
  onSubmit,
}: {
  open: boolean;
  disabled: boolean;
  onClose: () => void;
  onSubmit: (body: {
    status: "SAFE" | "NEED_HELP";
    notes: string;
    latitude?: number;
    longitude?: number;
  }) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<"SAFE" | "NEED_HELP">("SAFE");
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  }>();
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  function close() {
    if (!disabled) {
      onClose();
      setError("");
      setLocation(undefined);
      setStatus("SAFE");
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="safety-dialog volunteer-modal">
        <DialogHeader>
          <span className="feature-icon mint">
            <HeartHandshake aria-hidden="true" />
          </span>
          <DialogTitle>Let your coordinator know.</DialogTitle>
          <DialogDescription>
            Record your current safety status with an optional location.
          </DialogDescription>
        </DialogHeader>
        <form
          className="volunteer-dialog-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const fields = new FormData(event.currentTarget);
            setError("");
            if (
              !(await onSubmit({
                status,
                notes: String(fields.get("notes") || "").trim(),
                ...location,
              }))
            )
              setError(
                "The check-in could not be recorded. Check your connection and retry.",
              );
          }}
        >
          <fieldset className="checkin-choices" disabled={disabled}>
            <legend className="sr-only">Volunteer safety status</legend>
            {(["SAFE", "NEED_HELP"] as const).map((value) => (
              <label
                key={value}
                className={`checkin-choice ${status === value ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="volunteer-safety"
                  value={value}
                  checked={status === value}
                  onChange={() => setStatus(value)}
                />
                {value === "SAFE" ? "I am safe" : "I need help"}
              </label>
            ))}
          </fieldset>
          <div className="form-field">
            <Label htmlFor="volunteer-check-in-notes">
              Check-in notes <span>(optional)</span>
            </Label>
            <Textarea
              id="volunteer-check-in-notes"
              name="notes"
              maxLength={2000}
              rows={3}
              disabled={disabled}
              placeholder="Your situation, location, or what you need…"
            />
          </div>
          <div className="volunteer-checkin-location">
            <Button
              type="button"
              variant="outline"
              disabled={disabled || locating}
              onClick={() => {
                if (!navigator.geolocation) {
                  setError(
                    "Location is unavailable. Describe it in the notes instead.",
                  );
                  return;
                }
                setLocating(true);
                navigator.geolocation.getCurrentPosition(
                  ({ coords }) => {
                    setLocation({
                      latitude: coords.latitude,
                      longitude: coords.longitude,
                    });
                    setLocating(false);
                  },
                  () => {
                    setError(
                      "Your location could not be accessed. You can still submit a check-in.",
                    );
                    setLocating(false);
                  },
                  { timeout: 10000, maximumAge: 60000 },
                );
              }}
            >
              <LocateFixed aria-hidden="true" />
              {locating
                ? "Finding location…"
                : location
                  ? "Update my location"
                  : "Attach my location"}
            </Button>
            {location && (
              <span>
                {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}{" "}
                <button type="button" onClick={() => setLocation(undefined)}>
                  Remove
                </button>
              </span>
            )}
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <p className="volunteer-field-help">
            This saves a coordinator-visible record. It does not call emergency
            services or confirm that anyone has seen your request.
          </p>
          <Button type="submit" disabled={disabled}>
            <HeartHandshake aria-hidden="true" />
            Save safety check-in
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
