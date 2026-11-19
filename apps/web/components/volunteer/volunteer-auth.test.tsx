// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  enroll: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    signUp: { email: mocks.signUp },
    signIn: { email: mocks.signIn },
  },
}));
vi.mock("@/lib/volunteer-api", async (original) => ({
  ...(await original<typeof import("@/lib/volunteer-api")>()),
  volunteerApi: { enroll: mocks.enroll },
}));

import { VolunteerAuth } from "./volunteer-auth";

describe("volunteer registration recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps a created account and retries only enrollment after a profile-save failure", async () => {
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mocks.enroll.mockRejectedValue(
      new Error("Enrollment temporarily unavailable"),
    );
    render(<VolunteerAuth mode="register" />);
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Test Volunteer" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "volunteer@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "TestPassword123!" },
    });
    fireEvent.change(screen.getByLabelText("Phone number", { exact: true }), {
      target: { value: "+91 90000 00000" },
    });
    fireEvent.change(screen.getByLabelText("Your location"), {
      target: { value: "Pune" },
    });
    fireEvent.change(screen.getByLabelText("Skills", { exact: true }), {
      target: { value: "Logistics, Translation" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Volunteer registration" }),
    );
    await screen.findByRole("alert");
    expect(mocks.signUp).toHaveBeenCalledOnce();
    expect(mocks.enroll).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: "+91 90000 00000",
        location: "Pune",
        skills: ["Logistics", "Translation"],
      }),
    );
    expect(
      screen.getByText(/Your account has been created/),
    ).toBeInTheDocument();
    fireEvent.submit(
      screen.getByRole("form", { name: "Volunteer registration" }),
    );
    await waitFor(() => expect(mocks.enroll).toHaveBeenCalledTimes(2));
    expect(mocks.enroll).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        phone: "+91 90000 00000",
        location: "Pune",
        skills: ["Logistics", "Translation"],
      }),
    );
    expect(mocks.signUp).toHaveBeenCalledOnce();
  });

  it("does not enroll a volunteer when account creation fails", async () => {
    mocks.signUp.mockResolvedValue({
      error: { message: "An account already exists" },
    });
    render(<VolunteerAuth mode="register" />);
    fireEvent.change(screen.getByLabelText("Full name"), {
      target: { value: "Test Volunteer" },
    });
    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "volunteer@example.test" },
    });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "TestPassword123!" },
    });
    fireEvent.submit(
      screen.getByRole("form", { name: "Volunteer registration" }),
    );
    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      "An account already exists",
    );
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
});
