import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell, type AppRole } from "@/components/shared/app-shell";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const role = session?.user?.role?.trim().toLowerCase();
  const hasAccess = role === "analyst" || role === "admin" || role === "viewer";

  if (!session || !hasAccess) {
    redirect("/login");
  }

  return (
    <AppShell
      role={role?.toUpperCase() as AppRole}
      user={session.user}
    >
      {children}
    </AppShell>
  );
}
