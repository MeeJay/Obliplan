// ============================================================================
// User teams - Axis C of the permission matrix. A team groups tenant users and
// carries a resource scope (clients/projects, read-only or read-write). Mirrors
// Obliance team groups.
// ============================================================================

export type TeamScope = 'client' | 'project' | 'all';
export type TeamLevel = 'ro' | 'rw';

export interface UserTeam {
  id: number;
  tenantId: number;
  name: string;
  description: string | null;
  /** Members of this team may create new projects. */
  canCreate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMembership {
  teamId: number;
  userId: number;
}

export interface TeamPermission {
  id: number;
  tenantId: number;
  teamId: number;
  /** 'all' = every resource of every kind; 'client'/'project' target scopeId. */
  scope: TeamScope;
  /** Target client/project id; 0 means "all of this kind". */
  scopeId: number;
  level: TeamLevel;
  createdAt: string;
  updatedAt: string;
}
