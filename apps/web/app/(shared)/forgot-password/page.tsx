import { ForgotPasswordForm } from "@/components/shared/forgot-password-form";

export default function ForgotPasswordPage() {
    return (
        <main
            id="main-content"
            className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10"
        >
            <div className="w-full max-w-sm">
                <ForgotPasswordForm />
            </div>
        </main>
    );
}
