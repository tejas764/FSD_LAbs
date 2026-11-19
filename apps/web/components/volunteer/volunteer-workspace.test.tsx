// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  dashboard: vi.fn(),
  tasks: vi.fn(),
  availability: vi.fn(),
  progress: vi.fn(),
  complete: vi.fn(),
  checkIn: vi.fn(),
  view: "overview",
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(`view=${mocks.view}`),
}));
vi.mock("@/lib/offline/connectivity", () => ({
  useConnectivity: () => ({ isOnline: true }),
}));
vi.mock("@/lib/volunteer-api", async (original) => ({
  ...(await original<typeof import("@/lib/volunteer-api")>()),
  volunteerApi: {
    dashboard: mocks.dashboard,
    eligibleTasks: mocks.tasks,
    availability: mocks.availability,
    progress: mocks.progress,
    complete: mocks.complete,
    checkIn: mocks.checkIn,
  },
}));

import { VolunteerWorkspace } from "./volunteer-workspace";

const time = "2026-11-18T10:00:00.000Z";
const task = {
  id: "t1",
  title: "Community supplies",
  description: "Organise donated supplies.",
  location: "Community hall",
  requiredSkills: ["Logistics"],
  requiresVerification: false,
  capacity: 5,
  status: "OPEN",
  startsAt: null,
  endsAt: null,
  createdAt: time,
  updatedAt: time,
};
const assignment = {
  id: "a1",
  volunteerId: "v1",
  taskId: "t1",
  task,
  status: "IN_PROGRESS",
  progress: 25,
  progressNotes: "",
  assignedAt: time,
  acceptedAt: time,
  submittedHours: null,
  verifiedHours: null,
};
const dashboard = {
  profile: {
    id: "v1",
    userId: "u1",
    name: "Test Volunteer",
    email: "volunteer@example.test",
    phone: "+919000000000",
    location: "Pune",
    bio: "",
    skills: ["Logistics"],
    emergencyContactName: "",
    emergencyContactPhone: "",
    verificationStatus: "PENDING",
    availability: "AVAILABLE",
    createdAt: time,
    updatedAt: time,
  },
  stats: {
    assignedTasks: 1,
    upcomingShifts: 0,
    completedTasks: 0,
    verifiedHours: 0,
  },
  assignments: [assignment],
  shifts: [],
  history: [assignment],
  checkIns: [],
};

describe("volunteer workspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.view = "overview";
    mocks.dashboard.mockResolvedValue(dashboard);
    mocks.tasks.mockResolvedValue([]);
    mocks.progress.mockResolvedValue({});
    mocks.complete.mockResolvedValue({});
  });

  it("does not add submitted hours to verified totals and saves progress through the API", async () => {
    render(<VolunteerWorkspace />);
    await screen.findByRole("heading", { name: /Good to have you here/ });
    const slider = screen.getByRole("slider", { name: "Task progress" });
    expect(slider).toHaveAttribute("min", "25");
    expect(slider).toHaveAttribute("max", "99");
    fireEvent.change(slider, { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Save progress" }));
    await waitFor(() =>
      expect(mocks.progress).toHaveBeenCalledWith("a1", 50, ""),
    );
    fireEvent.click(screen.getByRole("button", { name: "Submit completion" }));
    fireEvent.change(screen.getByLabelText("Completion summary"), {
      target: { value: "Organised and handed over supplies." },
    });
    fireEvent.change(screen.getByLabelText("Hours volunteered"), {
      target: { value: "2.5" },
    });
    fireEvent.submit(
      screen.getByLabelText("Completion summary").closest("form")!,
    );
    await waitFor(() =>
      expect(mocks.complete).toHaveBeenCalledWith(
        "a1",
        "Organised and handed over supplies.",
        2.5,
      ),
    );
    expect(
      screen
        .getByText("Verified hours", { exact: true })
        .closest("article")
        ?.querySelector("strong"),
    ).toHaveTextContent("0");
  });

  it("uses the tasks navigation query to open the eligible catalog", async () => {
    mocks.view = "tasks";
    render(<VolunteerWorkspace />);
    await screen.findByRole("heading", { name: "Tasks that fit your profile" });
    expect(screen.getByRole("tab", { name: "Eligible tasks" })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("No eligible tasks right now")).toBeInTheDocument();
  });
});
