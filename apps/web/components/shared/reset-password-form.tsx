"use client";

import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm() {
    const { t } = useTranslation();
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get("token");

    const [newPassword, setNewPassword] = useState("");
    const [pending, setPending] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!token) {
            setError(t("shared.reset_password_page.error_invalid"));
            return;
        }
        setPending(true);
        setError(null);

        const result = await authClient.resetPassword({ newPassword, token });

        if (result.error) {
            setError(t("shared.reset_password_page.error_invalid"));
            setPending(false);
            return;
        }

        setDone(true);
        setPending(false);
        setTimeout(() => router.push("/login"), 2000);
    };

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">{t("shared.reset_password_page.title")}</CardTitle>
                    <CardDescription>{t("shared.reset_password_page.subtitle")}</CardDescription>
                </CardHeader>
                <CardContent>
                    {done ? (
                        <p role="status" className="text-center text-sm text-muted-foreground">
                            {t("shared.reset_password_page.success")}
                        </p>
                    ) : (
                        <form
                            role="form"
                            aria-label={t("shared.reset_password_page.title")}
                            className="flex flex-col gap-4"
                            onSubmit={onSubmit}
                        >
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="new-password">
                                    {t("shared.reset_password_page.new_password_label")}
                                </Label>
                                <Input
                                    id="new-password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                            </div>

                            {error && (
                                <p role="alert" className="text-sm text-destructive">
                                    {error}
                                </p>
                            )}

                            <Button type="submit" disabled={pending || !token} className="w-full">
                                {pending
                                    ? t("shared.reset_password_page.submitting")
                                    : t("shared.reset_password_page.submit")}
                            </Button>
                        </form>
                    )}

                    <div className="mt-4 text-center text-sm">
                        <a
                            href="/login"
                            className="underline-offset-2 hover:underline text-muted-foreground"
                        >
                            {t("shared.reset_password_page.back_to_login")}
                        </a>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
