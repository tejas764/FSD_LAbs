import { VolunteerWorkspace } from "@/components/volunteer/volunteer-workspace";
import { Suspense } from "react";
export default function VolunteerDashboardPage() {
  return (
    <Suspense
      fallback={
        <p className="response-page" role="status">
          Opening your volunteer workspace…
        </p>
      }
    >
      <VolunteerWorkspace />
    </Suspense>
  );
}
