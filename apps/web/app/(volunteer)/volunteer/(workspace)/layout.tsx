import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shared/app-shell";
import { auth } from "@/lib/auth";

export default async function VolunteerWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let session: Awaited<ReturnType<typeof auth.api.getSession>> = null;
  let unavailable = false;
  try {
    session = await auth.api.getSession({ headers: await headers() });
  } catch {
    unavailable = true;
  }
  if (!session)
    redirect(`/volunteer/login${unavailable ? "?reason=unavailable" : ""}`);
  return (
    <AppShell role="VOLUNTEER" user={session.user}>
      {children}
    </AppShell>
  );
}
