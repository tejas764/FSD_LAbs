-- Optimize primary reports feed query used by GET /api/v1/reports
-- Pattern: crisisId + non-duplicate/non-superseded/non-deleted + newest first (submittedAt, id)

CREATE INDEX IF NOT EXISTS "report_feed_active_crisis_submitted_id_idx"
ON "Report" ("crisisId", "submittedAt" DESC, "id" DESC)
WHERE "isDuplicate" = false
  AND "supersededById" IS NULL
  AND "deletedAt" IS NULL;
