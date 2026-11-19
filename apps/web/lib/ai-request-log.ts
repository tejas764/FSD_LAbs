export type AiRequestCategory = "Interface" | "Volunteer platform" | "Delivery";

export interface AiRequestLogEntry {
  id: string;
  sequence: number;
  title: string;
  category: AiRequestCategory;
  request: string;
}

/** Verbatim user task requests available in the current conversation. */
export const AI_REQUEST_LOG: readonly AiRequestLogEntry[] = [
  {
    id: "request-01",
    sequence: 1,
    title: "Disaster management features and interface redesign",
    category: "Interface",
    request:
      "perfect now add more functionalities in this disaster management app,make UI very asthetic make website responsive and arrange elements accordingly i want you to use asthetic colors beatiful interface i want for this...",
  },
  {
    id: "request-02",
    sequence: 2,
    title: "Volunteer platform, evaluation logs, and GitHub delivery",
    category: "Volunteer platform",
    request: `Add functionaliteies for volunteers..volunteer registration ,log in,Proper dashboard for volunteers and also make sure ...all things working propelry...voluteer dashboard should contatin Profile summary

1. Verification status
2. Availability toggle (Available / Busy / Offline)
3. Assigned tasks
4. Upcoming shifts
5. Completed tasks
6. Total verified volunteer hours
7. Safety check-in option
8. Task history

- Manage their own profile.
- Update availability.
- View eligible tasks.
- Accept or decline assignments.
- Update assigned task progress.
- Submit task completion reports.

and after completing this push this code to my github resqnet creating a new branch named newversion,make sure you add a tab there Ai logs which will include all the logs i gave ,this is forevalatuion my teacher asked me to do..and make sure you did not include any credits to any other user this project is completely mine and i am doing it properly.`,
  },
  {
    id: "request-03",
    sequence: 3,
    title: "GitHub delivery repository clarification",
    category: "Delivery",
    request:
      "[https://github.com/tejas764/FSD_LAbs](https://github.com/tejas764/FSD_LAbs)",
  },
];

export const AI_LOG_SCOPE =
  "Verbatim user messages available in this conversation. This record contains three user messages: two task requests and a delivery clarification. Earlier unavailable chats, internal instructions, and runtime logs are not included. No timestamps have been inferred.";

export function exportAiRequestLogJson() {
  return JSON.stringify(
    {
      format: "resqnet-ai-request-log",
      version: 1,
      scope: AI_LOG_SCOPE,
      entries: AI_REQUEST_LOG,
    },
    null,
    2,
  );
}

export function exportAiRequestLogText() {
  return [
    "RESQNET — AI REQUEST LOG",
    "Available conversation requests",
    "",
    AI_LOG_SCOPE,
    "",
    ...AI_REQUEST_LOG.flatMap((entry) => [
      `REQUEST ${String(entry.sequence).padStart(2, "0")}: ${entry.title}`,
      `Category: ${entry.category}`,
      "Verbatim user request:",
      entry.request,
      "",
      "---",
      "",
    ]),
  ].join("\n");
}
