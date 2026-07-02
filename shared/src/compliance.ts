// ============================================================================
// Working-time compliance flags computed over a user's weekly shifts.
// Surfaced (non-blocking) on the planning so a manager sees an illegal or
// risky schedule before publishing it. Pure French-labour-law defaults.
// ============================================================================

export type ComplianceCode =
  | 'OVERLAP' // two shifts overlap on the same day
  | 'REST_DAILY_11H' // < 11h rest between two consecutive days
  | 'REST_WEEKLY_35H' // no 35h continuous weekly rest
  | 'MAX_DAY_10H' // > 10h worked in a single day
  | 'MAX_WEEK_48H'; // > 48h worked in the week

export type ComplianceSeverity = 'error' | 'warn';

export interface ComplianceFlag {
  code: ComplianceCode;
  severity: ComplianceSeverity;
  /** Human-readable French message. */
  message: string;
  /** The day the flag concerns, when applicable. */
  date: string | null;
}
