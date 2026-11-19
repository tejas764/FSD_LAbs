import type { PrismaClient } from "@prisma/client";
import { effectiveVerificationStatus, invalidateChangedVolunteerIdentity } from "./verified-identity";

describe("verification follows the coordinator-reviewed identity", () => {
  it("does not treat a renamed identity as verified even before the auth after-hook finishes", () => {
    expect(effectiveVerificationStatus({ verificationStatus: "VERIFIED", verifiedName: "Original name", user: { name: "New name" } })).toBe("PENDING");
    expect(effectiveVerificationStatus({ verificationStatus: "VERIFIED", verifiedName: "Original name", user: { name: "Original name" } })).toBe("VERIFIED");
    expect(effectiveVerificationStatus({ verificationStatus: "REJECTED", verifiedName: null, user: { name: "New name" } })).toBe("REJECTED");
  });

  it("invalidates only the persisted target user's mismatched verified-name snapshots", async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    await invalidateChangedVolunteerIdentity({ volunteerProfile: { updateMany } } as unknown as Pick<PrismaClient, "volunteerProfile">, { id: "persisted-user-id", name: "Updated name" });
    expect(updateMany).toHaveBeenCalledWith({
      where: { userId: "persisted-user-id", verificationStatus: "VERIFIED", OR: [{ verifiedName: null }, { verifiedName: { not: "Updated name" } }] },
      data: { verificationStatus: "PENDING", verifiedBy: null, verifiedAt: null, verifiedName: null },
    });
  });
});
