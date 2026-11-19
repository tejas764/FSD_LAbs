import type { PrismaClient } from "@prisma/client";

/** Better Auth invokes this hook with the persisted target user's ID. Never infer a target from client body fields. */
export async function invalidateChangedVolunteerIdentity(
  prisma: Pick<PrismaClient, "volunteerProfile">,
  user: { id: string; name?: string | null },
) {
  const name = user.name ?? "";
  await prisma.volunteerProfile.updateMany({
    where: { userId: user.id, verificationStatus: "VERIFIED", OR: [{ verifiedName: null }, { verifiedName: { not: name } }] },
    data: { verificationStatus: "PENDING", verifiedBy: null, verifiedAt: null, verifiedName: null },
  });
}

export function effectiveVerificationStatus<T extends { verificationStatus: "PENDING" | "VERIFIED" | "REJECTED"; verifiedName: string | null; user: { name: string | null } }>(profile: T): T["verificationStatus"] {
  return profile.verificationStatus === "VERIFIED" && profile.verifiedName !== (profile.user.name ?? "") ? "PENDING" : profile.verificationStatus;
}
