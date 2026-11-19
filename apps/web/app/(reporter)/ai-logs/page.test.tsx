// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AI_REQUEST_LOG } from "@/lib/ai-request-log";

const download = vi.hoisted(() => vi.fn());
vi.mock("@/lib/safety-plan", () => ({ downloadText: download }));

import AiLogsPage from "./page";

describe("evaluation request log", () => {
  beforeEach(() => {
    download.mockReset();
  });

  it("searches verbatim request text and lets an empty search be cleared", async () => {
    const user = userEvent.setup();
    render(<AiLogsPage />);
    await user.type(
      screen.getByLabelText("Search AI request logs"),
      "verified volunteer hours",
    );
    expect(
      screen.getByRole("heading", {
        name: "Volunteer platform, evaluation logs, and GitHub delivery",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Disaster management features and interface redesign",
      }),
    ).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search AI request logs"));
    await user.type(
      screen.getByLabelText("Search AI request logs"),
      "no matching request",
    );
    expect(
      screen.getByRole("heading", { name: "No matching requests" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("Showing 3 of 3 requests")).toBeInTheDocument();
  });

  it("exports the complete unmodified request record even when the page is filtered", async () => {
    const user = userEvent.setup();
    render(<AiLogsPage />);
    await user.click(
      screen.getByRole("button", { name: "Volunteer platform" }),
    );
    expect(screen.getByText("Showing 1 of 3 requests")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export all JSON" }));
    const [filename, body, type] = download.mock.calls[0];
    expect(filename).toBe("resqnet-ai-logs.json");
    expect(type).toBe("application/json");
    expect(JSON.parse(body).entries).toEqual(AI_REQUEST_LOG);
    expect(JSON.parse(body).scope).toContain("three user messages");
    expect(
      JSON.parse(body).entries.every(
        (entry: Record<string, unknown>) => !("timestamp" in entry),
      ),
    ).toBe(true);
  });

  it("copies the full original request and reports clipboard rejection", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    render(<AiLogsPage />);
    await user.click(screen.getByRole("button", { name: "Copy request 2" }));
    expect(writeText).toHaveBeenCalledWith(AI_REQUEST_LOG[1].request);
    expect(screen.getByRole("status")).toHaveTextContent(
      "full user request was copied",
    );
    writeText.mockRejectedValueOnce(
      new DOMException("Denied", "NotAllowedError"),
    );
    await user.click(screen.getByRole("button", { name: "Copy request 1" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Clipboard access is unavailable",
    );
    writeText.mockRestore();
  });

  it("preserves the separate delivery clarification verbatim", async () => {
    const user = userEvent.setup();
    render(<AiLogsPage />);
    await user.click(screen.getByRole("button", { name: "Delivery" }));
    expect(screen.getByText("Showing 1 of 3 requests")).toBeInTheDocument();
    expect(
      screen.getByText(
        "[https://github.com/tejas764/FSD_LAbs](https://github.com/tejas764/FSD_LAbs)",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Disaster management features and interface redesign",
      }),
    ).not.toBeInTheDocument();
  });
});
