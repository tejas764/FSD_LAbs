// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
    ReportsModerationConfirmDialog,
} from "./reports-moderation-confirm-dialog";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

describe("ReportsModerationConfirmDialog", () => {
    it("renders cancel and confirm actions", () => {
        render(
            <ReportsModerationConfirmDialog
                open
                onOpenChange={vi.fn()}
                status="APPROVED"
                count={1}
                onConfirm={vi.fn()}
            />,
        );

        expect(screen.getByRole("button", { name: "dashboard.reports.cancel_action" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "dashboard.reports.confirm_action" })).toBeInTheDocument();
    });

    it("closes dialog when cancel button is clicked", async () => {
        const onOpenChange = vi.fn();

        render(
            <ReportsModerationConfirmDialog
                open
                onOpenChange={onOpenChange}
                status="REJECTED"
                count={2}
                onConfirm={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "dashboard.reports.cancel_action" }));

        expect(onOpenChange).toHaveBeenCalledWith(false);
    });
});
