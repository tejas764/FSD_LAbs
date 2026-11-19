// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, waitFor } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import { describe, expect, it, vi } from "vitest";

expect.extend(toHaveNoViolations);

const { mockListUsers, mockCreateUser, mockSetRole, mockBanUser } = vi.hoisted(() => ({
  mockListUsers: vi.fn(),
  mockCreateUser: vi.fn(),
  mockSetRole: vi.fn(),
  mockBanUser: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "en", dir: () => "ltr" },
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { role: "admin" } } }),
  authClient: {
    admin: {
      listUsers: mockListUsers,
      createUser: mockCreateUser,
      setRole: mockSetRole,
      banUser: mockBanUser,
    },
  },
}));

import UsersPage from "./page";

describe("Users page accessibility", () => {
  it("has no axe violations after loading users", async () => {
    mockListUsers.mockResolvedValue({
      users: [
        {
          id: "u1",
          email: "viewer@test.com",
          name: "Viewer User",
          role: "viewer",
          banned: false,
        },
      ],
      total: 1,
    });

    const { container } = render(<UsersPage />);

    await waitFor(() => {
      expect(container).toHaveTextContent("dashboard.users.title");
      expect(container).toHaveTextContent("viewer@test.com");
    });

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
