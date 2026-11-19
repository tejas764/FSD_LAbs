import { Suspense } from "react";
import { ResetPasswordForm } from "@/components/shared/reset-password-form";

export default function ResetPasswordPage() {
    return (
        <main
            id="main-content"
            className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10"
        >
            <div className="w-full max-w-sm">
                <Suspense>
                    <ResetPasswordForm />
                </Suspense>
            </div>
        </main>
    );
}
