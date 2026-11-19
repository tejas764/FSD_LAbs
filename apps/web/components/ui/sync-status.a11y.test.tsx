import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";

import { SyncStatus } from "./sync-status";

expect.extend(toHaveNoViolations);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("SyncStatus a11y", () => {
  it("has no axe violations across sync states", async () => {
    const { container } = render(
      <div>
        <SyncStatus status="local" />
        <SyncStatus status="queued" />
        <SyncStatus status="syncing" />
        <SyncStatus status="synced" />
        <SyncStatus status="failed" />
      </div>,
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
