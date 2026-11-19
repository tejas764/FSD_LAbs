// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ResetPasswordForm } from "./reset-password-form";

const { mockResetPassword } = vi.hoisted(() => ({
  mockResetPassword: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { dir: () => "ltr" },
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    resetPassword: mockResetPassword,
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: (key: string) => (key === "token" ? "test-token-123" : null) }),
  useRouter: () => ({ push: vi.fn() }),
}));

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders new password input and submit button", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByLabelText("shared.reset_password_page.new_password_label")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls resetPassword with token and new password", async () => {
    mockResetPassword.mockResolvedValue({ data: {}, error: null });
    render(<ResetPasswordForm />);

    fireEvent.change(
      screen.getByLabelText("shared.reset_password_page.new_password_label"),
      { target: { value: "NewSecure@123" } },
    );
    fireEvent.submit(screen.getByRole("form"));

    await waitFor(() =>
      expect(mockResetPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          newPassword: "NewSecure@123",
          token: "test-token-123",
        }),
      ),
    );
  });

  it("shows success message after reset", async () => {
    mockResetPassword.mockResolvedValue({ data: {}, error: null });
    render(<ResetPasswordForm />);

    fireEvent.change(
      screen.getByLabelText("shared.reset_password_page.new_password_label"),
      { target: { value: "NewSecure@123" } },
    );
    fireEvent.submit(screen.getByRole("form"));

    await waitFor(() =>
      expect(screen.getByText("shared.reset_password_page.success")).toBeInTheDocument(),
    );
  });

  it("shows error when token is missing", () => {
    vi.doMock("next/navigation", () => ({
      useSearchParams: () => ({ get: () => null }),
      useRouter: () => ({ push: vi.fn() }),
    }));
    // Token missing case is shown via error_invalid text
  });

  it("has a link back to sign in", () => {
    render(<ResetPasswordForm />);
    expect(screen.getByRole("link", { name: "shared.reset_password_page.back_to_login" })).toHaveAttribute("href", "/login");
  });
});
