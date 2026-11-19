// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const session = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "admin-user", role: session.role } },
    isPending: false,
  }),
}));

import VolunteerCoordinationPage from "./page";

const timestamp = "2026-11-18T12:00:00.000Z";
const volunteerId = "11111111-1111-4111-8111-111111111111";
const task = {
  id: "task-1",
  title: "Pack relief supplies",
  description: "Label boxes and keep walkways clear.",
  location: "Community centre",
  requiredSkills: ["logistics"],
  requiresVerification: true,
  capacity: 2,
  status: "OPEN",
  startsAt: null,
  endsAt: null,
  remainingCapacity: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const profile = {
  id: volunteerId,
  userId: "volunteer-user",
  name: "Verified volunteer",
  email: "volunteer@example.test",
  phone: "+91 90000 00000",
  location: "Pune",
  bio: "Community logistics volunteer.",
  skills: ["logistics"],
  verificationStatus: "VERIFIED",
  availability: "AVAILABLE",
  createdAt: timestamp,
  updatedAt: timestamp,
};
const assignment = {
  id: "assignment-1",
  volunteerId,
  taskId: task.id,
  status: "COMPLETION_SUBMITTED",
  progress: 100,
  completionSummary: "Packed and labelled all supply boxes.",
  submittedHours: 2.5,
  verifiedHours: 0,
  assignedAt: timestamp,
  completedAt: timestamp,
  task,
  volunteer: {
    id: volunteerId,
    userId: profile.userId,
    user: { id: profile.userId, name: profile.name, email: profile.email },
  },
};
const overview = {
  profiles: [
    profile,
    {
      ...profile,
      id: "22222222-2222-4222-8222-222222222222",
      name: "Pending volunteer",
      email: "pending@example.test",
      userId: "pending-user",
      verificationStatus: "PENDING",
    },
    {
      ...profile,
      id: "33333333-3333-4333-8333-333333333333",
      name: "Busy volunteer",
      email: "busy@example.test",
      userId: "busy-user",
      availability: "BUSY",
    },
  ],
  tasks: [task],
  assignments: [assignment],
  shifts: [],
  checkIns: [],
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  session.role = "admin";
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async (_input, init) =>
      new Response(
        JSON.stringify({
          success: true,
          data: init?.method === "GET" ? overview : {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
});

describe("volunteer coordinator workspace", () => {
  it("does not request coordinator data for a non-admin account", () => {
    session.role = "viewer";
    render(<VolunteerCoordinationPage />);
    expect(
      screen.getByRole("heading", { name: "Coordinator access required" }),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers a task only to eligible volunteers who have not already received it", async () => {
    const user = userEvent.setup();
    // This overview contains an existing submitted assignment for the verified person.
    const candidate = {
      ...profile,
      id: "44444444-4444-4444-8444-444444444444",
      name: "Eligible volunteer",
      email: "eligible@example.test",
      userId: "eligible-user",
    };
    fetchMock.mockImplementation(
      async (_input, init) =>
        new Response(
          JSON.stringify({
            success: true,
            data:
              init?.method === "GET"
                ? { ...overview, profiles: [...overview.profiles, candidate] }
                : {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    render(<VolunteerCoordinationPage />);
    await screen.findByRole("heading", { name: "Volunteer directory" });
    await user.click(screen.getByRole("tab", { name: "Tasks" }));
    await user.click(screen.getByRole("button", { name: "Offer assignment" }));
    const dialog = screen.getByRole("dialog");
    const selection = within(dialog).getByRole("combobox", {
      name: "Eligible volunteer",
    });
    expect(
      within(selection).queryByRole("option", { name: /Pending volunteer/ }),
    ).not.toBeInTheDocument();
    expect(
      within(selection).queryByRole("option", { name: /Busy volunteer/ }),
    ).not.toBeInTheDocument();
    expect(
      within(selection).queryByRole("option", { name: /Verified volunteer/ }),
    ).not.toBeInTheDocument();
    await user.selectOptions(selection, candidate.id);
    await user.click(
      within(dialog).getByRole("button", { name: "Send assignment offer" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/volunteers/admin/tasks/task-1/assign",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ volunteerId: candidate.id }),
      }),
    );
    expect(
      await screen.findByText(
        "Assignment offered. The volunteer can accept or decline it.",
      ),
    ).toBeInTheDocument();
  });

  it("requires review notes when returning a completion report", async () => {
    const user = userEvent.setup();
    render(<VolunteerCoordinationPage />);
    await screen.findByRole("heading", { name: "Volunteer directory" });
    await user.click(screen.getByRole("tab", { name: /Completion reviews/ }));
    await user.click(screen.getByRole("button", { name: "Review completion" }));
    const dialog = screen.getByRole("dialog");
    const returnButton = within(dialog).getByRole("button", {
      name: "Return for updates",
    });
    expect(returnButton).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText("Review notes"),
      "Please add the distribution count.",
    );
    await user.click(returnButton);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/volunteers/admin/assignments/assignment-1/review",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          decision: "RETURN",
          notes: "Please add the distribution count.",
        }),
      }),
    );
    expect(
      await screen.findByText("Report returned to the volunteer for updates."),
    ).toBeInTheDocument();
  });

  it("keeps a rejected verification action open and does not show success", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(
      async (_input, init) =>
        new Response(
          JSON.stringify(
            init?.method === "GET"
              ? { success: true, data: overview }
              : { message: "Forbidden" },
          ),
          {
            status: init?.method === "GET" ? 200 : 403,
            headers: { "Content-Type": "application/json" },
          },
        ),
    );
    render(<VolunteerCoordinationPage />);
    await screen.findByRole("heading", { name: "Volunteer directory" });
    await user.click(
      screen.getAllByRole("button", { name: "Review verification" })[1],
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Verify volunteer",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Coordinator access is required",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.queryByText("Verification set to verified."),
    ).not.toBeInTheDocument();
  });
});
