import type { JobsOptions } from "bullmq";

export const AI_CLASSIFICATION_QUEUE = "ai-classification" as const;
export const DESCRIPTION_TRANSLATION_QUEUE = "description-translation" as const;
export const EXPORT_QUEUE = "reports-export" as const;
export const RETENTION_QUEUE = "retention" as const;

export const AI_CLASSIFICATION_JOB_NAME = "classify" as const;
export const DESCRIPTION_TRANSLATION_JOB_NAME = "translate" as const;
export const EXPORT_JOB_NAME = "generate-export" as const;
export const RETENTION_JOB_NAME = "purge-retained-reports" as const;

export const QUEUE_RETRY_ATTEMPTS = 3;
export const QUEUE_RETRY_DELAY_MS = 2000;
export const QUEUE_BACKOFF_TYPE = "exponential" as const;

export const QUEUE_JOB_OPTIONS: JobsOptions = {
  attempts: QUEUE_RETRY_ATTEMPTS,
  backoff: {
    type: QUEUE_BACKOFF_TYPE,
    delay: QUEUE_RETRY_DELAY_MS,
  },
  removeOnComplete: true,
};

// Export jobs must be retained after completion so the status endpoint can
// serve the signed download URL. Keep completed jobs for 24 h.
export const EXPORT_JOB_OPTIONS: JobsOptions = {
  attempts: QUEUE_RETRY_ATTEMPTS,
  backoff: {
    type: QUEUE_BACKOFF_TYPE,
    delay: QUEUE_RETRY_DELAY_MS,
  },
  removeOnComplete: { age: 24 * 60 * 60 },
  removeOnFail: { age: 24 * 60 * 60 },
};

export const RETENTION_JOB_OPTIONS: JobsOptions = {
  jobId: RETENTION_JOB_NAME,
  repeat: {
    pattern: "0 0 * * *",
  },
  removeOnComplete: true,
  removeOnFail: { age: 24 * 60 * 60 },
};

export const UN_LANGUAGES = ["ar", "zh", "en", "fr", "ru", "es"] as const;
export type UnLanguage = (typeof UN_LANGUAGES)[number];
