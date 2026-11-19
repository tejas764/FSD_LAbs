-- One-time cleanup for legacy anonymous better-auth accounts.
-- These were previously created by anonymous auth bootstrap.
-- Deletes cascade to session/account via FK ON DELETE CASCADE.

DELETE FROM "user"
WHERE COALESCE("isAnonymous", false) = true
   OR "email" LIKE '%@reporter.crisismap.local';
