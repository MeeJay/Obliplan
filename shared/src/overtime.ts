// ============================================================================
// Employee overtime self-declaration (heures supplémentaires déclarées).
// Employees on heures_sup contracts declare their own overtime, tagged with a
// per-tenant customizable nature (Inter, Astreinte Admin, Jour Férié…).
// ============================================================================

export type OvertimeStatus = 'en_attente' | 'valide' | 'refuse';

/** A configurable overtime nature per tenant (Inter, Astreinte, Jour Férié…). */
export interface OvertimeNature {
  id: number;
  tenantId: number;
  libelle: string;
  color: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A self-declared overtime entry with its validation workflow. */
export interface OvertimeDeclaration {
  id: number;
  tenantId: number;
  userId: number;
  natureId: number;
  date: string;
  /** Declared overtime in minutes. */
  minutes: number;
  /** Portion converted to récup (0..minutes). */
  recupMinutes: number;
  motif: string | null;
  status: OvertimeStatus;
  decidedBy: number | null;
  decidedAt: string | null;
  /** Manager's reason (required on refusal). */
  decisionComment: string | null;
  createdAt: string;
  updatedAt: string;
  /** Employee display name - only populated on manager-facing feeds (e.g. pending list). */
  userName?: string;
}

/** Per-employee monthly overtime aggregate for the manager console. */
export interface OvertimeTeamSummary {
  userId: number;
  userName: string;
  validatedMinutes: number; // gross validated overtime in the period (== Σ perNature)
  recupMinutes: number;     // portion of validated overtime converted to récup
  pendingMinutes: number;
  pendingCount: number;
  refusedCount: number;
  /** Validated minutes broken down per natureId within the period (natureId → minutes). */
  perNature: Record<number, number>;
}
