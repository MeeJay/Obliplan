// ============================================================================
// Permission matrix - Axis B: permission sets × capabilities, applied per tenant
// via user_tenants.role (= a permission_sets.slug). Mirrors Obliance.
// ============================================================================

export interface CapabilityDef {
  key: string;
  label: string;
  group: string;
}

/** Capability catalog (code constant - the source of truth for valid caps). */
export const CAPABILITIES: CapabilityDef[] = [
  { key: 'planning:read_team', label: "Voir le planning de l'équipe", group: 'Planning' },
  { key: 'planning:view_team', label: "Voir le planning de l'équipe (lecture seule)", group: 'Planning' },
  { key: 'planning:write', label: 'Créer / éditer / valider le planning', group: 'Planning' },
  { key: 'recup:manage', label: 'Gérer la récupération', group: 'Planning' },
  { key: 'hourtypes:manage', label: "Gérer les types d'heures", group: 'Planning' },
  { key: 'leave:validate', label: 'Valider les congés', group: 'Congés' },
  { key: 'leave:types:manage', label: 'Gérer les types de congés', group: 'Congés' },
  { key: 'contrats:manage', label: 'Gérer les contrats', group: 'Administration' },
  { key: 'users:manage', label: 'Gérer les salariés', group: 'Administration' },
  { key: 'tenants:manage', label: 'Gérer les workspaces', group: 'Administration' },
  { key: 'settings:manage', label: "Paramètres de l'instance", group: 'Administration' },
  { key: 'clients:manage', label: 'Gérer les clients', group: 'Projets' },
  { key: 'projects:create', label: 'Créer des projets', group: 'Projets' },
  { key: 'overtime:natures:manage', label: "Gérer les natures d'heures sup", group: 'Heures sup' },
  { key: 'overtime:validate', label: 'Valider les heures supplémentaires', group: 'Heures sup' },
];

export const CAPABILITY_KEYS = CAPABILITIES.map((c) => c.key);

export type Capability = string;

export interface PermissionSet {
  id: number;
  name: string;
  slug: string;
  capabilities: Capability[];
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Effective per-tenant permissions for the current user (sent in /auth/me). */
export interface UserPermissions {
  /** Platform admin (users.role='admin') → all capabilities. */
  isAdmin: boolean;
  /** Resolved capabilities in the active tenant. */
  tenantCapabilities: Capability[];
}
