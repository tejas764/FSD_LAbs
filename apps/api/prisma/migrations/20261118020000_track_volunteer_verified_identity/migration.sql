ALTER TABLE "VolunteerProfile" ADD COLUMN "verifiedName" VARCHAR(100);
UPDATE "VolunteerProfile" AS profile
SET "verifiedName" = COALESCE(account."name", '')
FROM "user" AS account
WHERE account."id" = profile."userId" AND profile."verificationStatus" = 'VERIFIED';
