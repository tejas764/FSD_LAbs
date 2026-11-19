// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ForgotPasswordForm } from "./forgot-password-form";

const { mockForgetPassword } = vi.hoisted(() => ({
  mockForgetPassword: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { dir: () => "ltr" },
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    requestPasswordReset: mockForgetPassword,
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: () => null }),
}));

describe("ForgotPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders email input and submit button", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByRole("textbox", { name: /shared\.forgot_password_page\.email_label/i })).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("calls forgetPassword with entered email", async () => {
    mockForgetPassword.mockResolvedValue({ data: {}, error: null });
    render(<ForgotPasswordForm />);

    fireEvent.change(
      screen.getByRole("textbox", { name: /shared\.forgot_password_page\.email_label/i }),
      { target: { value: "analyst@undp.org" } },
    );
    fireEvent.submit(screen.getByRole("form"));

    await waitFor(() =>
      expect(mockForgetPassword).toHaveBeenCalledWith(
        expect.objectContaining({ email: "analyst@undp.org" }),
      ),
    );
  });

  it("shows success message on completion", async () => {
    mockForgetPassword.mockResolvedValue({ data: {}, error: null });
    render(<ForgotPasswordForm />);

    fireEvent.change(
      screen.getByRole("textbox", { name: /shared\.forgot_password_page\.email_label/i }),
      { target: { value: "analyst@undp.org" } },
    );
    fireEvent.submit(screen.getByRole("form"));

    await waitFor(() =>
      expect(screen.getByText("shared.forgot_password_page.success")).toBeInTheDocument(),
    );
  });

  it("shows an error when the reset request fails", async () => {
    mockForgetPassword.mockResolvedValue({
      data: null,
      error: { message: "SMTP unavailable" },
    });
    render(<ForgotPasswordForm />);

    fireEvent.change(
      screen.getByRole("textbox", { name: /shared\.forgot_password_page\.email_label/i }),
      { target: { value: "analyst@undp.org" } },
    );
    fireEvent.submit(screen.getByRole("form"));

    await waitFor(() =>
      expect(screen.getByText("shared.forgot_password_page.error_generic")).toBeInTheDocument(),
    );
    expect(screen.queryByText("shared.forgot_password_page.success")).not.toBeInTheDocument();
  });

  it("has a link back to sign in", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByRole("link", { name: "shared.forgot_password_page.back_to_login" })).toHaveAttribute("href", "/login");
  });
});
