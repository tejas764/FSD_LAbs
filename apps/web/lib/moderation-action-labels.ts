export const MODERATION_ACTION_LABEL_KEYS = {
  APPROVED: "dashboard.actions.approve",
  REJECTED: "dashboard.actions.reject",
  FLAGGED: "dashboard.actions.flag_duplicate",
  UNDER_REVIEW: "dashboard.moderation.needs_more_info",
} as const;

export type ModerationActionStatus = keyof typeof MODERATION_ACTION_LABEL_KEYS;