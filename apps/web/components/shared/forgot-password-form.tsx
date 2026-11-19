"use client";

import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
    const { t } = useTranslation();
    const [email, setEmail] = useState("");
    const [pending, setPending] = useState(false);
    const [done, setDone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setPending(true);
        setError(null);

        try {
            const result = await authClient.requestPasswordReset({
                email,
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (result?.error) {
                setError(t("shared.forgot_password_page.error_generic"));
                setDone(false);
                return;
            }

            // Keep the success message generic to avoid email enumeration.
            setDone(true);
        } catch {
            setError(t("shared.forgot_password_page.error_generic"));
            setDone(false);
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">{t("shared.forgot_password_page.title")}</CardTitle>
                    <CardDescription>{t("shared.forgot_password_page.subtitle")}</CardDescription>
                </CardHeader>
                <CardContent>
                    {error ? (
                        <p role="alert" className="mb-4 text-sm text-destructive">
                            {error}
                        </p>
                    ) : null}

                    {done ? (
                        <p role="status" className="text-center text-sm text-muted-foreground">
                            {t("shared.forgot_password_page.success")}
                        </p>
                    ) : (
                        <form
                            role="form"
                            aria-label={t("shared.forgot_password_page.title")}
                            className="flex flex-col gap-4"
                            onSubmit={onSubmit}
                        >
                            <div className="flex flex-col gap-2">
                                <Label htmlFor="email">
                                    {t("shared.forgot_password_page.email_label")}
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <Button type="submit" disabled={pending} className="w-full">
                                {pending
                                    ? t("shared.forgot_password_page.submitting")
                                    : t("shared.forgot_password_page.submit")}
                            </Button>
                        </form>
                    )}

                    <div className="mt-4 text-center text-sm">
                        <a
                            href="/login"
                            className="underline-offset-2 hover:underline text-muted-foreground"
                        >
                            {t("shared.forgot_password_page.back_to_login")}
                        </a>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
