import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

const mocks = vi.hoisted(() => ({
  connection: { isOnline: true, preference: "online", ready: true, syncing: false, pendingCount: 2, failedCount: 1, syncNow: async () => {}, setPreference: vi.fn() },
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() },
}));
vi.mock("@/lib/offline/connectivity", () => ({ useConnectivity: () => mocks.connection }));
vi.mock("next/navigation", () => ({ usePathname: () => "/offline", useRouter: () => mocks.router }));

import { ConnectivityControls } from "./connectivity-controls";

expect.extend(toHaveNoViolations);

describe("ConnectivityControls a11y", () => {
  it.each([true, false])("has no axe violations when effective online state is %s", async (online) => {
    mocks.connection.isOnline = online;
    mocks.connection.preference = online ? "online" : "offline";
    const { container } = render(<header><ConnectivityControls /></header>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
