// ============================================================================
// Analytics / Reporting hub (Rapports): cross-cutting, read-only management
// aggregates over a chosen period - KPI summary + time by project + by employee.
// Reads existing data only (no money model - billing is a later wave).
// ============================================================================

/**
 * KPI summary for the reporting period [from, to) over the manager's scope
 * (admin/platformAdmin → whole tenant, manager → direct reports).
 */
export interface ReportSummary {
  /** Inclusive ISO start of the period (yyyy-mm-dd). */
  from: string;
  /** Exclusive ISO end of the period (yyyy-mm-dd). */
  to: string;
  /** Σ tracked minutes (finished time_entries) for scope users in the period. */
  trackedMin: number;
  /** Σ expected (attendu) minutes over the scope users' weeks intersecting the period. */
  plannedMin: number;
  /** Σ validated overtime minutes for scope users in the period. */
  overtimeMin: number;
  /** Σ récup balance across scope users (can be negative). */
  recupBalanceMin: number;
  /** Σ approved leave days starting within the next 30 days for scope users. */
  leaveDaysUpcoming: number;
  /** Number of users in scope. */
  activeUsers: number;
}

/** Tracked time grouped by project (board), for the period over the scope. */
export interface ReportByProject {
  boardId: number;
  boardName: string;
  /** Client the board belongs to, null when the board has no client. */
  clientName: string | null;
  /** Σ tracked minutes on this board for scope users in the period. */
  trackedMin: number;
  /** How many time entries fed the total. */
  entryCount: number;
}

/** One fortnight ('quinzaine') column in the astreinte report. */
export interface AstreinteQuinzaineCol {
  /** ISO Monday starting the fortnight. */
  start: string;
  /** ISO Sunday ending the fortnight (start + 13 days). */
  end: string;
}

/** One employee's on-call (astreinte) totals across the report's fortnights. */
export interface AstreinteQuinzaineRow {
  userId: number;
  /** COALESCE(display_name, username) of the teammate. */
  userName: string;
  /** Per-fortnight cells, aligned to the report's `quinzaines` order. */
  cells: { start: string; minutes: number; count: number }[];
  /** Σ on-call minutes across the period. */
  totalMin: number;
  /** Σ astreinte shifts (déclenchements) across the period. */
  totalCount: number;
}

/**
 * Astreinte (on-call) aggregated per fortnight ('quinzaine'), per employee, over the
 * period. Only employees with at least one validated astreinte shift appear in `rows`.
 */
export interface AstreinteQuinzaineReport {
  quinzaines: AstreinteQuinzaineCol[];
  rows: AstreinteQuinzaineRow[];
}

/** Per-employee tracked vs planned time (and overtime) for the period. */
export interface ReportByUser {
  userId: number;
  /** COALESCE(display_name, username) of the teammate. */
  userName: string;
  /** Σ tracked minutes for this user in the period. */
  trackedMin: number;
  /** Σ expected (attendu) minutes over this user's weeks intersecting the period. */
  plannedMin: number;
  /** Σ validated overtime minutes for this user in the period. */
  overtimeMin: number;
  /** trackedMin − plannedMin (can be negative). */
  ecartMin: number;
}
