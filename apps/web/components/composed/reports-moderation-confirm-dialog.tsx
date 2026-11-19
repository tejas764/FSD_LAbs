"use client";

import { useTranslation } from "react-i18next";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ModerationConfirmStatus = "APPROVED" | "REJECTED" | "FLAGGED" | "UNDER_REVIEW";

interface ReportsModerationConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    status: ModerationConfirmStatus | null;
    count: number;
    onConfirm: () => void;
}

export function ReportsModerationConfirmDialog({
    open,
    onOpenChange,
    status,
    count,
    onConfirm,
}: ReportsModerationConfirmDialogProps) {
    const { t } = useTranslation();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader className="text-start">
                    <DialogTitle>{t("dashboard.reports.confirm_title")}</DialogTitle>
                    <DialogDescription>
                        {t("dashboard.reports.confirm_description", {
                            action: status ? t(`reporter.my_reports.moderation.${status}`) : "",
                            count,
                        })}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        {t("dashboard.reports.cancel_action")}
                    </Button>
                    <Button type="button" onClick={onConfirm}>
                        {t("dashboard.reports.confirm_action")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
