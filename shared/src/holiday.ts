// ============================================================================
// Public holidays - a global FR national set (tenantId NULL) plus per-tenant
// custom rows. Used to skip férié weekdays in leave-day and expected-hour calcs.
// ============================================================================

/** A public holiday: global (tenantId null) or tenant-specific custom row. */
export interface PublicHoliday {
  id: number;
  /** null = global national set; otherwise the owning tenant. */
  tenantId: number | null;
  /** ISO date yyyy-mm-dd. */
  date: string;
  label: string;
  /** Optional regional scope code (e.g. Alsace-Moselle); null for national. */
  regionCode: string | null;
}
