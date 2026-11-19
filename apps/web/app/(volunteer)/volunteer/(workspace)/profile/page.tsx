import { VolunteerWorkspace } from "@/components/volunteer/volunteer-workspace";
import { Suspense } from "react";
export default function VolunteerProfilePage() {
  return (
    <Suspense
      fallback={
        <p className="response-page" role="status">
          Opening your volunteer profile…
        </p>
      }
    >
      <VolunteerWorkspace profileOnly />
    </Suspense>
  );
}
