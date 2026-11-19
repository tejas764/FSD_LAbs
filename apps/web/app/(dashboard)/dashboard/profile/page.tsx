"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, ApiError } from "@/lib/api/client";
import { authClient } from "@/lib/auth-client";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { data: session } = authClient.useSession();
  const [name, setName] = useState(session?.user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pending, setPending] = useState(false);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    const result = await authClient.updateUser({ name });

    if (result.error) {
      toast.error(result.error.message ?? t("profile.update_failed"));
      setPending(false);
      return;
    }

    toast.success(t("profile.name_updated"));
    setPending(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      await apiClient.account.changePassword(currentPassword, newPassword);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error(t("profile.update_failed"));
      }
      setPending(false);
      return;
    }

    toast.success(t("profile.password_updated"));
    setCurrentPassword("");
    setNewPassword("");
    setPending(false);
  };

  return (
    <section className="flex flex-col gap-0 overflow-hidden">
      <div className="flex items-center border-b border-border px-6 py-4">
        <h2 className="text-base font-semibold text-foreground">
          {t("profile.title")}
        </h2>
      </div>

      <div className="flex flex-col gap-8 p-6 max-w-lg">
        {/* Name */}
        <form onSubmit={handleUpdateName} className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-foreground">{t("profile.section_name")}</h3>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-name">{t("profile.name_label")}</Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="profile-email">{t("profile.email_label")}</Label>
            <Input
              id="profile-email"
              value={session?.user?.email ?? ""}
              disabled
              autoComplete="email"
            />
          </div>
          <Button type="submit" disabled={pending} className="self-start">
            {t("profile.save")}
          </Button>
        </form>

        <hr className="border-border" />

        {/* Password */}
        <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-foreground">{t("profile.section_password")}</h3>
          <div className="flex flex-col gap-2">
            <Label htmlFor="current-password">{t("profile.current_password")}</Label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-password">{t("profile.new_password")}</Label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <Button type="submit" disabled={pending} className="self-start">
            {t("profile.change_password")}
          </Button>
        </form>
      </div>
    </section>
  );
}
