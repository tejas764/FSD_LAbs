"use client";

import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { UndpLogo } from "@/components/shared/undp-logo";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";

export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);

    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        toast.error(t("shared.login.error"));
        return;
      }
      const role = (result.data?.user as { role?: string } | undefined)?.role?.toLowerCase();
      window.location.href = role && ["admin", "analyst", "viewer"].includes(role) ? "/dashboard" : "/volunteer";
    } catch {
      toast.error(t("shared.login.error"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          {/* ── Left: form ─────────────────────────────────────────── */}
          <form
            className="flex flex-col gap-6 p-6 md:p-8"
            onSubmit={onSubmit}
            aria-label={t("shared.login.title")}
          >
            {/* Header */}
            <div className="flex flex-col items-center gap-2 text-center">
              <h1 className="text-2xl font-bold">{t("shared.login.title")}</h1>
              <p className="text-balance text-sm text-muted-foreground">
                {t("shared.login.subtitle")}
              </p>
            </div>

            {/* Email */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t("shared.login.email_label")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="analyst@undp.org"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">{t("shared.login.password_label")}</Label>
                <a
                  href="/forgot-password"
                  tabIndex={0}
                  className="ms-auto text-sm underline-offset-2 hover:underline text-muted-foreground"
                >
                  {t("shared.login.forgot_password")}
                </a>
              </div>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {/* Submit */}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? t("shared.login.submitting") : t("shared.login.submit")}
            </Button>
          </form>

          {/* ── Right: brand image — hidden on mobile ───────────────── */}
          <div
            aria-hidden="true"
            className="relative hidden bg-primary md:flex md:flex-col md:items-center md:justify-center md:gap-6 md:px-10 md:text-primary-foreground"
          >
            {/* UNDP wordmark  */}
            <div className="rounded-lg p-3">
              <UndpLogo className="h-20 w-auto" />
            </div>

            {/* Tagline */}
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-xl font-bold leading-snug">
                Crisis Damage Reporting
              </p>
              <p className="max-w-[220px] text-sm text-primary-foreground/75">
                Real‑time damage assessment for humanitarian response coordination.
              </p>
            </div>

            {/* Crisis type pills */}
            <div className="grid grid-cols-3 gap-2 w-full max-w-[220px]">
              {(["🌊\nFlood", "🏚\nEarthquake", "⚡\nConflict"] as const).map((label) => {
                const [emoji, text] = label.split("\n");
                return (
                  <div
                    key={text}
                    className="flex flex-col items-center justify-center gap-0.5 rounded-lg bg-primary-foreground/10 px-2 py-2 text-[11px] font-medium"
                  >
                    <span aria-hidden="true">{emoji}</span>
                    <span>{text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer note */}
      <p className="text-center text-sm text-muted-foreground">Want to help your community? <Link href="/volunteer/register" className="text-primary underline underline-offset-4">Register as a volunteer</Link></p>
      <p className="text-center text-xs text-muted-foreground px-6">
        {t("shared.login.footer_note")}
      </p>
    </div>
  );
}
