// ============================================================================
// Obliplan shared domain types - consumed by both server and client.
// Server maps snake_case DB rows → these camelCase shapes via rowToX helpers.
// ============================================================================

// ── API envelope ────────────────────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, string[] | undefined>;
}

// ── Theme / preferences ──────────────────────────────────────────────────────
// 'obli-daylight' is the light companion to 'obli-operator' (Obli suite v1 light kit).
export type AppTheme = 'obli-operator' | 'obli-daylight' | 'modern' | 'neon';

export interface UserPreferences {
  preferredTheme?: AppTheme;
  toastEnabled?: boolean;
  toastPosition?: 'top-center' | 'bottom-right';
}

// ── Roles ─────────────────────────────────────────────────────────────────────
// App role drives RBAC. `admin` = tenant administrator (also the target of an
// Obligate "all-tenants admin" mapping → platform/god view). `manager` manages
// their team's planning. `employe` sees only their own.
export type UserRole = 'admin' | 'manager' | 'employe';

// Per-tenant role carried by user_tenants (raw slug synced from Obligate).
export type TenantRole = 'admin' | 'manager' | 'employe' | string;

// ── Tenant ────────────────────────────────────────────────────────────────────
export interface Tenant {
  id: number;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantWithRole extends Tenant {
  role: TenantRole;
}

// ── User ──────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  /** Profile photo URL (synced from Obligate). Null/undefined → initials avatar. */
  avatar?: string | null;
  /** Contract that drives this user's work-time calculation. Null = no contract yet. */
  contratId: number | null;
  /** The manager responsible for this user's planning. Null for managers/admins. */
  managerId: number | null;
  preferences?: UserPreferences | null;
  preferredLanguage: string;
  /** Per-employee opt-in to the self-service récup view (/ma-recup). */
  recupSelfService?: boolean;
  /** Minutes before each shift change to be notified (push + in-app). Null/undefined = no lead alert. */
  shiftNotifyBeforeMin?: number | null;
  /** Notify AT the moment of each shift change. Default false (opt-in). */
  shiftNotifyAtChange?: boolean;
  // SSO foreign fields - null for local users
  foreignSource?: string | null;
  foreignId?: number | null;
  foreignSourceUrl?: string | null;
  /** True when the account has a local password (false = SSO-only). */
  hasPassword?: boolean;
  /** RGPD: ISO timestamp the account was anonymised (identity scrubbed), else null. */
  anonymizedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Contract (central model: carries the calc rules) ─────────────────────────
export interface Contrat {
  id: number;
  tenantId: number;
  libelle: string;
  /** Base weekly hours (35, 39…), stored in minutes for precision. */
  heuresHebdoBaseMin: number;
  /** If false, any overflow becomes récupération. If true, overflow is heures sup. */
  heuresSupAutorisees: boolean;
  /** Optional threshold (in minutes) above which overflow counts as heures sup. */
  seuilHeuresSupMin: number | null;
  /** If true, the contract is an alternance and uses jours d'école. */
  alternance: boolean;
  /** ISO country code (FR, MG…). The contract only observes the public holidays of its own
   *  country, so a team abroad works FR holidays as normal days. Default 'FR'. */
  pays: string;
  /** Multiplier on hours WORKED on an observed public holiday when crediting heures sup
   *  (2 = +100%). Default 1 = credited 1:1. */
  ferieWorkedCoeff: number;
  /** Optional color tag (hex) for planning visualization. Null = no color. */
  color: string | null;
  /**
   * Per-weekday expected minutes [Mon,Tue,Wed,Thu,Fri,Sat,Sun]. Null = legacy
   * uniform base/5 Mon–Fri. A weekday is "worked" iff its entry is > 0.
   */
  workPattern: number[] | null;
  /** Informative full-time-equivalent percentage (0–100). Null = unset. */
  ftePercent: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A lightweight upcoming timed shift for the home dashboard "mon créneau" widget: the
 * hour-type label/colour are resolved server-side so the card shows "Back" (not "Travail").
 * The client picks the in-progress / next one from this list using the Paris clock and a
 * self-refreshing tick, so the widget updates on shift changes without a page reload.
 */
export interface UpcomingShift {
  id: number;
  /** ISO date yyyy-mm-dd (Paris civil date). */
  date: string;
  /** HH:MM start / end. */
  start: string;
  end: string;
  type: ShiftType;
  /** Hour-type libellé (e.g. "Back"); null when the shift carries no hour type. */
  hourTypeLabel: string | null;
  /** Hour-type colour (hex) for the badge; null when none. */
  hourTypeColor: string | null;
  /** Project name when the shift is attached to a board; null otherwise. */
  boardName: string | null;
}

// ── Jours d'école (alternance) ───────────────────────────────────────────────
// Either a concrete date, or a recurring weekday within an optional period.
export interface JourEcole {
  id: number;
  tenantId: number;
  userId: number;
  /** Concrete school date (ISO yyyy-mm-dd), or null when recurring. */
  date: string | null;
  /** Recurring weekday 0=Sunday..6=Saturday, or null when one-off. */
  weekday: number | null;
  /** Optional bounds for the recurrence (ISO dates). */
  periodStart: string | null;
  periodEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Shifts ────────────────────────────────────────────────────────────────────
export type ShiftType =
  | 'travail'
  | 'pause'
  | 'repos'
  | 'recup'
  | 'conge'
  | 'absence'
  | 'ecole'
  | 'astreinte';

export type ShiftStatus = 'brouillon' | 'valide';

export interface Shift {
  id: number;
  tenantId: number;
  userId: number;
  /** ISO date (yyyy-mm-dd) the shift falls on. */
  date: string;
  /** Local time HH:mm (null for full-day non-work types like conge/repos). */
  heureDebut: string | null;
  heureFin: string | null;
  /** Unpaid break in minutes. */
  pauseMin: number;
  type: ShiftType;
  statut: ShiftStatus;
  note: string | null;
  /** Optional hour/activity type (label + color) this shift counts against. */
  hourTypeId: number | null;
  /** Optional project (board) this shift is worked on. */
  boardId: number | null;
  createdBy: number | null;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/** A reusable named shift a manager can apply to a day (Skello/Combo-style). */
export interface ShiftTemplate {
  id: number;
  tenantId: number;
  name: string;
  heureDebut: string;
  heureFin: string;
  pauseMin: number;
  type: ShiftType;
  hourTypeId: number | null;
  boardId: number | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Read-only team overview (Phase 7a / #20) ─────────────────────────────────
// Lightweight who-works-when projection for the every-employee read-only view,
// gated by `planning:view_team`. Carries ONLY validated shifts (never brouillon),
// with the free-text `note` stripped for privacy, and NO counters/écart/flags.
export interface TeamOverviewMember {
  userId: number;
  displayName: string | null;
  username: string;
  /** Validated shifts only, note stripped to null. */
  shifts: Shift[];
  /** Anonymised booked reservations (label "Rendez-vous" only, NO external name/e-mail):
   *  the read-only overview shows busy RDV blocks without exposing any personal data. */
  appointments: { id: number; date: string; start: string; end: string; status: 'pending' | 'confirmed' }[];
  /** Axis-C user_teams ids this member belongs to (tenant-scoped). [] = no team. */
  teamIds: number[];
  /** ISO dates that are public holidays for THIS member's contract country this week (sorted).
   *  Lets the overview mark a férié per employee - a MG member's fériés differ from a FR one's. */
  holidays: string[];
}

export interface TeamOverviewDTO {
  /** ISO date of the Monday of the week this overview covers. */
  monday: string;
  members: TeamOverviewMember[];
  /** ISO dates in [monday, monday+7) that are public holidays this week (week-level, tenant-wide; sorted). Visual day-marker only - shifts still render on a jour férié. */
  holidays: string[];
}

// ── Récupération movements ────────────────────────────────────────────────────
export type RecupSens = 'credit' | 'debit';

export interface RecupMouvement {
  id: number;
  tenantId: number;
  userId: number;
  /** ISO date of the Monday of the week this movement applies to. */
  semaine: string;
  /** Amount in minutes (always positive; direction given by `sens`). */
  heuresMin: number;
  sens: RecupSens;
  motif: string | null;
  source: string | null;            // 'manual' | 'eligible' | 'overtime' | 'recup-shift' | null
  overtimeDeclarationId: number | null;
  /** When this movement is the auto-debit trace of a planned 'recup' shift. */
  shiftId?: number | null;
  createdBy: number | null;
  createdAt: string;
}

// ── Computed weekly counters ──────────────────────────────────────────────────
// All durations in minutes. Derived, never stored.
export interface WeeklyCounter {
  userId: number;
  /** ISO date of the Monday of the week. */
  semaine: string;
  contratId: number | null;
  /** Σ(fin − début − pause) of validated `travail` shifts. */
  realiseMin: number;
  /** Expected weekly minutes: the contract base (or work-pattern weekly sum) minus
   *  jours d'école, public holidays and approved leave falling on worked days. */
  attenduMin: number;
  /** realise − attendu (can be negative). */
  ecartMin: number;
  /** Overflow counted as heures sup (contract with heures_sup_autorisees). */
  heuresSupMin: number;
  /** Overflow eligible for récup attribution (contract without heures sup). */
  recupEligibleMin: number;
  /** Number of école days excluded from attendu this week. */
  joursEcole: number;
  /** On-call (astreinte) time this week, counted as heures sup (minutes). */
  astreinteMin: number;
  /** Number of astreinte call-outs (déclenchements) this week. */
  astreinteDeclenchements: number;
  /** Approved leave days this week that reduced the expected hours. */
  congeJours: number;
}

/** Running récup balance for a user (sum of credits − debits). */
export interface RecupSolde {
  userId: number;
  soldeMin: number;
}

// ── Audit log (tamper-evident hash chain) ────────────────────────────────────
// One append-only row per sensitive mutation. `actorId` is an FK (SET NULL): an
// anonymised actor resolves live to `actorName: 'Salarié anonymisé'` - no PII is
// frozen into the trail. `meta` carries only NON-secret context (e.g. {decision}).
export interface AuditEntry {
  id: number;
  tenantId: number;
  actorId: number | null;
  actorName: string | null;
  action: string;
  entityType: string | null;
  entityId: number | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

// Result of walking a tenant's chain. `firstBrokenId` is the id of the first row
// whose stored hash / prev_hash linkage doesn't recompute (null when intact).
export interface AuditVerifyResult {
  ok: boolean;
  checked: number;
  firstBrokenId: number | null;
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export interface LoginRequest {
  username: string;
  password: string;
}

export interface SsoConfig {
  obligateEnabled: boolean;
  obligateReachable: boolean;
  obligateUrl: string | null;
}

export interface SessionInfo {
  user: User;
  currentTenantId: number;
  tenants: TenantWithRole[];
  /** Resolved capabilities for the current user in the active tenant. */
  capabilities: string[];
  /** Enabled module keys for the active tenant (default: all enabled). */
  modules: string[];
  /** Platform (system) admin - distinct from a per-tenant admin. Gates global config. */
  platformAdmin: boolean;
  /** The user's chosen default workspace (or null). Login lands here when accessible. */
  preferredTenantId: number | null;
}
