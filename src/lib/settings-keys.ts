/** Setting keys and defaults (no server-only import so scripts can use them). */
export const SETTING_KEYS = {
  orgName: "org_name",
  chapterName: "chapter_name",
  semesterLabel: "semester_label",
  laborTrackingStart: "labor_tracking_start",
  venmoHandle: "venmo_handle",
  houseMeetingDay: "house_meeting_day",
  houseMeetingTime: "house_meeting_time",
  missedCleanFineCents: "missed_clean_fine_cents",
  missedMeetingFineCents: "missed_meeting_fine_cents",
  sanctionsPolicy: "sanctions_policy",
  sanctionsBoardPublic: "sanctions_board_public",
} as const;

export const SETTING_DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.orgName]: "Zeta Psi",
  [SETTING_KEYS.chapterName]: "ZP House",
  [SETTING_KEYS.semesterLabel]: "Fall 2026",
  [SETTING_KEYS.laborTrackingStart]: "2026-10-18",
  [SETTING_KEYS.venmoHandle]: "",
  [SETTING_KEYS.houseMeetingDay]: "0",
  [SETTING_KEYS.houseMeetingTime]: "19:00",
  [SETTING_KEYS.missedCleanFineCents]: "2500",
  [SETTING_KEYS.missedMeetingFineCents]: "1000",
  [SETTING_KEYS.sanctionsBoardPublic]: "1",
};
