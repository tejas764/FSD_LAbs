// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class {
      observe() { }
      unobserve() { }
      disconnect() { }
    };
  }
  if (!window.HTMLElement.prototype.hasPointerCapture) {
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  }
  if (!window.HTMLElement.prototype.setPointerCapture) {
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
  }
  if (!window.HTMLElement.prototype.releasePointerCapture) {
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  }
});

const {
  mockListUsers,
  mockCreateUser,
  mockSetRole,
  mockBanUser,
  mockUnbanUser,
  mockUseSession,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockListUsers: vi.fn(),
  mockCreateUser: vi.fn(),
  mockSetRole: vi.fn(),
  mockBanUser: vi.fn(),
  mockUnbanUser: vi.fn(),
  mockUseSession: vi.fn(),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", dir: () => "ltr" },
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: mockUseSession,
  authClient: {
    admin: {
      listUsers: mockListUsers,
      createUser: mockCreateUser,
      setRole: mockSetRole,
      banUser: mockBanUser,
      unbanUser: mockUnbanUser,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

import UsersPage from "./page";

describe("Users page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: { user: { id: "admin-1", role: "admin" } } });
    mockListUsers.mockResolvedValue({
      users: [
        {
          id: "u1",
          email: "viewer@test.com",
          name: "Viewer User",
          role: "viewer",
          banned: false,
          createdAt: "2026-04-01T00:00:00Z",
          lastActiveAt: "2026-04-06T00:00:00Z",
        },
        {
          id: "u2",
          email: "analyst@test.com",
          name: "Analyst User",
          role: "analyst",
          banned: true,
          createdAt: "2026-03-15T00:00:00Z",
        },
      ],
      total: 2,
    });
    mockCreateUser.mockResolvedValue({});
    mockSetRole.mockResolvedValue({});
    mockBanUser.mockResolvedValue({});
    mockUnbanUser.mockResolvedValue({});
  });

  it("renders users heading and invite button", async () => {
    render(<UsersPage />);

    expect(screen.getByText("dashboard.users.title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "dashboard.users.invite" })).toBeInTheDocument();

    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalled();
    });
  });

  it("loads and renders user rows", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("viewer@test.com")).toBeInTheDocument();
      expect(screen.getByText("analyst@test.com")).toBeInTheDocument();
    });
  });

  it("shows created at column with locale-formatted date", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: "dashboard.users.table_created_at" })).toBeInTheDocument();
    });

    expect(screen.getByText("Apr 1, 2026")).toBeInTheDocument();
  });

  it("shows last active column with locale-formatted date", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: "dashboard.users.table_last_active" })).toBeInTheDocument();
    });

    expect(screen.getByText("Apr 6, 2026")).toBeInTheDocument();
  });

  it("formats createdAt when admin API returns Date objects", async () => {
    mockListUsers.mockResolvedValueOnce({
      users: [
        {
          id: "u3",
          email: "date@test.com",
          name: "Date User",
          role: "viewer",
          banned: false,
          createdAt: new Date("2026-04-05T00:00:00.000Z"),
        },
      ],
      total: 1,
    });

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("Apr 5, 2026")).toBeInTheDocument();
    });
  });

  it("uses bordered card container around users table", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      const table = screen.getByTestId("dashboard-data-table");
      const container = table.closest("div.overflow-hidden.rounded-lg.border.border-border.bg-card");
      expect(container).toBeInTheDocument();
    });
  });

  it("shows table pagination controls", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "dashboard.overview.table_prev" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "dashboard.overview.table_next" })).toBeInTheDocument();
    });
  });

  it("renders sortable name header button", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "dashboard.users.table_name" })).toBeInTheDocument();
    });
  });

  it("invites a user via createUser", async () => {
    render(<UsersPage />);

    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.invite" }));
    await userEvent.type(await screen.findByLabelText("dashboard.users.name"), "New User");
    await userEvent.type(screen.getByLabelText("dashboard.users.email"), "new@test.com");
    await userEvent.type(screen.getByLabelText("dashboard.users.temp_password"), "TempPass123!");

    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.send_invite" }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "new@test.com",
          name: "New User",
          password: "TempPass123!",
        }),
      );
      expect(mockToastSuccess).toHaveBeenCalledWith("dashboard.users.toast_invite_success");
    });
  });

  it("shows backend validation message toast when create user returns API error payload", async () => {
    mockCreateUser.mockResolvedValueOnce({
      error: {
        message: "[body.name] Invalid input: expected string, received undefined",
        code: "VALIDATION_ERROR",
      },
    });

    render(<UsersPage />);

    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.invite" }));
    await userEvent.type(await screen.findByLabelText("dashboard.users.email"), "new@test.com");
    await userEvent.type(screen.getByLabelText("dashboard.users.temp_password"), "TempPass123!");

    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.send_invite" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("[body.name] Invalid input: expected string, received undefined");
      expect(mockToastSuccess).not.toHaveBeenCalledWith("dashboard.users.toast_invite_success");
    });
  });

  it("changes role via setRole", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("viewer@test.com")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("combobox", { name: "dashboard.users.role viewer@test.com" }));
    await userEvent.click(await screen.findByRole("option", { name: "dashboard.users.role_admin" }));

    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.confirm_admin_action" }));

    await waitFor(() => {
      expect(mockSetRole).toHaveBeenCalledWith({ userId: "u1", role: "admin" });
      expect(mockToastSuccess).toHaveBeenCalledWith("dashboard.users.toast_role_success");
    });
  });

  it("requires confirmation before granting admin role", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("viewer@test.com")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("combobox", { name: "dashboard.users.role viewer@test.com" }));
    await userEvent.click(await screen.findByRole("option", { name: "dashboard.users.role_admin" }));

    expect(mockSetRole).not.toHaveBeenCalled();
    expect(screen.getByText("dashboard.users.confirm_admin_title")).toBeInTheDocument();
  });

  it("updates role optimistically without reloading the full table", async () => {
    mockSetRole.mockImplementation(() => new Promise(() => {
      // keep pending to verify optimistic UI before network resolves
    }));

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("viewer@test.com")).toBeInTheDocument();
    });

    const roleSelect = screen.getByRole("combobox", { name: "dashboard.users.role viewer@test.com" });
    expect(roleSelect).toHaveTextContent("dashboard.users.role_viewer");

    await userEvent.click(roleSelect);
    await userEvent.click(await screen.findByRole("option", { name: "dashboard.users.role_admin" }));
    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.confirm_admin_action" }));

    await waitFor(() => {
      expect(roleSelect).toHaveTextContent("dashboard.users.role_admin");
    });
    expect(mockListUsers).toHaveBeenCalledTimes(1);
  });

  it("deactivates a user via banUser", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("viewer@test.com")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.deactivate viewer@test.com" }));

    await waitFor(() => {
      expect(mockBanUser).toHaveBeenCalledWith({ userId: "u1", banReason: "dashboard_deactivated" });
      expect(mockToastSuccess).toHaveBeenCalledWith("dashboard.users.toast_deactivate_success");
    });
  });

  it("updates active status optimistically without reloading the full table", async () => {
    mockBanUser.mockImplementation(() => new Promise(() => {
      // keep pending to verify optimistic UI before network resolves
    }));

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("viewer@test.com")).toBeInTheDocument();
    });

    const viewerRow = screen.getByText("viewer@test.com").closest("tr");
    expect(viewerRow).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.deactivate viewer@test.com" }));

    await waitFor(() => {
      expect(within(viewerRow as HTMLElement).getByText("dashboard.users.status_deactivated")).toBeInTheDocument();
      expect(within(viewerRow as HTMLElement).getByRole("button", { name: "dashboard.users.activate viewer@test.com" })).toBeInTheDocument();
    });

    expect(mockListUsers).toHaveBeenCalledTimes(1);
  });

  it("activates a deactivated user via unbanUser", async () => {
    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("analyst@test.com")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.activate analyst@test.com" }));

    await waitFor(() => {
      expect(mockUnbanUser).toHaveBeenCalledWith({ userId: "u2" });
      expect(mockToastSuccess).toHaveBeenCalledWith("dashboard.users.toast_activate_success");
    });
  });

  it("shows error toast and rolls back role when role change fails", async () => {
    mockSetRole.mockRejectedValueOnce(new Error("failed"));

    render(<UsersPage />);

    await waitFor(() => {
      expect(screen.getByText("viewer@test.com")).toBeInTheDocument();
    });

    const roleSelect = screen.getByRole("combobox", { name: "dashboard.users.role viewer@test.com" });
    await userEvent.click(roleSelect);
    await userEvent.click(await screen.findByRole("option", { name: "dashboard.users.role_admin" }));
    await userEvent.click(screen.getByRole("button", { name: "dashboard.users.confirm_admin_action" }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("failed");
      expect(roleSelect).toHaveTextContent("dashboard.users.role_viewer");
    });
  });
});
