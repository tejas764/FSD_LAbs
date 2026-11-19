// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { signInAnonymousMock } = vi.hoisted(() => ({
  signInAnonymousMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      anonymous: signInAnonymousMock,
    },
  },
  useSession: () => ({
    data: null,
    isPending: false,
  }),
}));

import { ReporterSessionBootstrap } from "./reporter-session-bootstrap";

describe("ReporterSessionBootstrap", () => {
  it("does not auto create anonymous sessions", () => {
    render(<ReporterSessionBootstrap />);

    expect(signInAnonymousMock).not.toHaveBeenCalled();
  });
});
