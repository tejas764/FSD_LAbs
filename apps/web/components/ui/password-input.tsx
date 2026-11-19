"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";

export interface PasswordInputProps
    extends React.InputHTMLAttributes<HTMLInputElement> {
    showToggle?: boolean;
}

export function PasswordInput({
    showToggle = true,
    className = "",
    ...props
}: PasswordInputProps) {
    const { t } = useTranslation();
    const [showPassword, setShowPassword] = useState(false);

    return (
        <div className="relative">
            <Input
                {...props}
                type={showPassword ? "text" : "password"}
                className={`pe-10 ${className}`}
            />
            {showToggle && (
                <button
                    type="button"
                    aria-label={
                        showPassword
                            ? t("profile.hide_password")
                            : t("profile.show_password")
                    }
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 end-2 my-auto inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                    {showPassword ? (
                        <EyeOff aria-hidden="true" className="size-4" />
                    ) : (
                        <Eye aria-hidden="true" className="size-4" />
                    )}
                </button>
            )}
        </div>
    );
}
