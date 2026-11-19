-- Extend AuditAction enum for retention/deletion privacy operations
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_DELETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'REPORT_ANONYMIZED';

-- Track when PII has been anonymized in-place
ALTER TABLE "Report" ADD COLUMN "anonymizedAt" TIMESTAMP(3);
