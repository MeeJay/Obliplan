// ============================================================================
// Leave & absence management (congés, absences, arrêts maladie…).
// ============================================================================

export type LeaveStatus = 'brouillon' | 'en_attente' | 'valide' | 'refuse' | 'annule';

/** Half-day precision for a leave boundary: whole day, morning or afternoon. */
export type LeavePeriod = 'full' | 'am' | 'pm';

/** A configurable leave/absence type per tenant (CP, RTT, maladie, sans solde…). */
export interface LeaveType {
  id: number;
  tenantId: number;
  libelle: string;
  /** Short code, e.g. 'CP', 'RTT', 'MAL'. */
  code: string;
  color: string | null;
  /** Paid leave (informative). */
  paid: boolean;
  /** When true, approved leave on these days reduces the expected weekly hours. */
  reducesAttendu: boolean;
  /** Requires a justificatif (e.g. arrêt maladie). */
  requiresJustification: boolean;
  /** Annual allowance in days; null = no balance tracking (e.g. maladie, sans solde). */
  allowanceDays: number | null;
  /**
   * How the balance is granted:
   *  - 'fixed_annual': the full `allowanceDays` is available for the period (legacy);
   *  - 'monthly': days accrue at `accrualRatePerMonth` each month of the acquisition period.
   */
  accrualMode: 'fixed_annual' | 'monthly';
  /** Per-month accrual rate in days (e.g. 2.5 for CP); only used when accrualMode === 'monthly'. */
  accrualRatePerMonth: number | null;
  /** Acquisition-period anchor month (1–12, e.g. 6 = June for CP). */
  periodStartMonth: number;
  isActive: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

/** A leave request with its validation workflow. */
export interface LeaveRequest {
  id: number;
  tenantId: number;
  userId: number;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  /** Half-day request (only meaningful for a single-day range). */
  halfDay: boolean;
  /** Period the request starts on (am/pm = half-day start). */
  startPeriod: LeavePeriod;
  /** Period the request ends on (am/pm = half-day end). */
  endPeriod: LeavePeriod;
  /** Computed number of leave days (weekdays in range; 0.5 for a single half-day). */
  days: number;
  motif: string | null;
  status: LeaveStatus;
  decidedBy: number | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
  updatedAt: string;
  /** Requester display name - only populated on manager listings (e.g. pending). */
  userName?: string;
}

/** Computed per-type balance for a user, scoped to the active acquisition period. */
export interface LeaveBalance {
  leaveTypeId: number;
  allowanceDays: number | null;
  /**
   * Days acquired so far in the active period: for 'monthly' types this is the
   * running accrual to-date (rate × months elapsed, capped at 12 months); for
   * 'fixed_annual' types it equals `allowanceDays`. null = no balance tracking.
   */
  acquiredDays: number | null;
  consumedDays: number;
  pendingDays: number;
  remainingDays: number | null;
  /** Human label of the active period, e.g. "2026/2027" (non-Jan) or "2026" (Jan-anchored). */
  periodLabel: string;
}

/** A team-calendar entry: a leave request enriched with user + type display info. */
export interface LeaveCalendarEntry {
  id: number;
  userId: number;
  userName: string;
  leaveTypeId: number;
  leaveTypeLibelle: string;
  leaveTypeColor: string | null;
  startDate: string;
  endDate: string;
  startPeriod: LeavePeriod;
  endPeriod: LeavePeriod;
  days: number;
  status: LeaveStatus;
}
