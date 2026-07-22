// ============================================================================
// Planning "Vues" - per-user saved presets of visible team ids for the team
// planning views (grid / récap / read-only overview). A view is owned by ONE
// user within ONE tenant; `teamIds` are the Axis-C `user_teams` ids kept VISIBLE
// by the preset. An empty `teamIds` array means "all teams" (no filter).
// ============================================================================

/** Lightweight ref for a tenant's Axis-C team, used to label + order planning rows. */
export interface PlanningTeamRef {
  id: number;
  name: string;
  /** Ordering weight: lower = higher priority (sorts first). */
  weight: number;
}

export interface PlanningView {
  id: number;
  name: string;
  /** UserTeam ids VISIBLE in this view; [] means "all teams". */
  teamIds: number[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanningViewInput {
  name: string;
  teamIds: number[];
}
