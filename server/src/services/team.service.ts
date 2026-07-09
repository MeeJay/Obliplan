import { db } from '../db';
import type { UserTeam, TeamPermission, TeamScope, TeamLevel, TeamMember, TeamMemberRole } from '@obliplan/shared';

interface UserTeamRow {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  can_create: boolean;
  created_at: Date;
  updated_at: Date;
}

interface TeamMembershipRow {
  team_id: number;
  user_id: number;
  role: TeamMemberRole;
}

interface TeamPermissionRow {
  id: number;
  tenant_id: number;
  team_id: number;
  scope: string;
  scope_id: number;
  level: string;
  created_at: Date;
  updated_at: Date;
}

export function rowToTeam(r: UserTeamRow): UserTeam {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    description: r.description ?? null,
    canCreate: r.can_create,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export function rowToTeamPermission(r: TeamPermissionRow): TeamPermission {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    teamId: r.team_id,
    scope: r.scope as TeamScope,
    scopeId: r.scope_id,
    level: r.level as TeamLevel,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export interface TeamInput {
  name: string;
  description?: string | null;
  canCreate?: boolean;
}

export interface TeamPermissionInput {
  scope: TeamScope;
  scopeId?: number;
  level?: TeamLevel;
}

/**
 * Effective resource reach a user gains through their team memberships (Axis C).
 * `allClients`/`allProjects` are set by a `scope='all'` grant or a `client`/`project`
 * grant with `scope_id=0` ("all of kind"); otherwise the id-sets list the specific
 * clients/projects reachable. `canCreate` is true if any of the user's teams may
 * spin up projects. `level` is the highest level granted (rw beats ro).
 */
export interface ResolvedScope {
  allClients: boolean;
  clientIds: Set<number>;
  allProjects: boolean;
  projectIds: Set<number>;
  canCreate: boolean;
  level: TeamLevel;
}

/** Viewer context so platform/tenant admins short-circuit to full access. */
export interface ScopeContext {
  platformAdmin?: boolean;
  role?: string;
}

export const teamService = {
  async getAll(tenantId: number): Promise<UserTeam[]> {
    const rows = await db<UserTeamRow>('user_teams').where({ tenant_id: tenantId }).orderBy('name');
    return rows.map(rowToTeam);
  },

  async getById(id: number, tenantId: number): Promise<UserTeam | null> {
    const row = await db<UserTeamRow>('user_teams').where({ id, tenant_id: tenantId }).first();
    return row ? rowToTeam(row) : null;
  },

  async create(tenantId: number, data: TeamInput): Promise<UserTeam> {
    const [row] = await db<UserTeamRow>('user_teams')
      .insert({
        tenant_id: tenantId,
        name: data.name,
        description: data.description ?? null,
        can_create: data.canCreate ?? false,
      })
      .returning('*');
    return rowToTeam(row);
  },

  async update(id: number, tenantId: number, data: Partial<TeamInput>): Promise<UserTeam | null> {
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.canCreate !== undefined) patch.can_create = data.canCreate;
    const [row] = await db<UserTeamRow>('user_teams')
      .where({ id, tenant_id: tenantId })
      .update(patch)
      .returning('*');
    return row ? rowToTeam(row) : null;
  },

  async delete(id: number, tenantId: number): Promise<boolean> {
    return (await db('user_teams').where({ id, tenant_id: tenantId }).del()) > 0;
  },

  /**
   * Resolve a user's effective Axis-C scope from their team memberships +
   * team_permissions. Platform/tenant admins get full access. Idempotent read.
   */
  async resolveScope(userId: number, tenantId: number, ctx: ScopeContext = {}): Promise<ResolvedScope> {
    if (ctx.platformAdmin || ctx.role === 'admin') {
      return {
        allClients: true,
        clientIds: new Set(),
        allProjects: true,
        projectIds: new Set(),
        canCreate: true,
        level: 'rw',
      };
    }
    const teams = await db<{ id: number; can_create: boolean }>('team_memberships as tm')
      .join('user_teams as ut', 'ut.id', 'tm.team_id')
      .where('tm.user_id', userId)
      .andWhere('ut.tenant_id', tenantId)
      .select('ut.id', 'ut.can_create');
    const scope: ResolvedScope = {
      allClients: false,
      clientIds: new Set(),
      allProjects: false,
      projectIds: new Set(),
      canCreate: teams.some((t) => t.can_create),
      level: 'ro',
    };
    if (teams.length === 0) return scope;
    const perms = await db<TeamPermissionRow>('team_permissions')
      .whereIn('team_id', teams.map((t) => t.id))
      .andWhere({ tenant_id: tenantId });
    for (const p of perms) {
      if (p.level === 'rw') scope.level = 'rw';
      if (p.scope === 'all') {
        scope.allClients = true;
        scope.allProjects = true;
      } else if (p.scope === 'client') {
        if (p.scope_id === 0) scope.allClients = true;
        else scope.clientIds.add(p.scope_id);
      } else if (p.scope === 'project') {
        if (p.scope_id === 0) scope.allProjects = true;
        else scope.projectIds.add(p.scope_id);
      }
    }
    return scope;
  },

  // ── Members ────────────────────────────────────────────────────────────────
  async getMembers(teamId: number): Promise<TeamMember[]> {
    const rows = await db<TeamMembershipRow>('team_memberships').where({ team_id: teamId }).select('user_id', 'role');
    return rows.map((r) => ({ userId: r.user_id, role: r.role }));
  },

  /** Replace-all: the given members (with roles) become the team's exact membership.
   *  Only ids that are real tenant users are kept; an unknown role falls back to 'member'. */
  async setMembers(teamId: number, tenantId: number, members: TeamMember[]): Promise<TeamMember[]> {
    const requestedIds = members.map((m) => m.userId);
    const validIds = requestedIds.length
      ? new Set(
          (await db('users').where({ tenant_id: tenantId }).whereIn('id', requestedIds).select('id')).map(
            (r: { id: number }) => r.id,
          ),
        )
      : new Set<number>();
    // De-dupe by userId (last wins) and drop non-members.
    const byId = new Map<number, TeamMemberRole>();
    for (const m of members) {
      if (validIds.has(m.userId)) byId.set(m.userId, m.role === 'manager' ? 'manager' : 'member');
    }
    await db.transaction(async (trx) => {
      await trx('team_memberships').where({ team_id: teamId }).del();
      if (byId.size) {
        await trx('team_memberships').insert(
          [...byId].map(([userId, role]) => ({ team_id: teamId, user_id: userId, role })),
        );
      }
    });
    return [...byId].map(([userId, role]) => ({ userId, role }));
  },

  // ── Resource scope (permissions) ─────────────────────────────────────────────
  async getPermissions(teamId: number, tenantId: number): Promise<TeamPermission[]> {
    const rows = await db<TeamPermissionRow>('team_permissions')
      .where({ team_id: teamId, tenant_id: tenantId })
      .orderBy('id');
    return rows.map(rowToTeamPermission);
  },

  /** Replace-all: the given rows become the team's exact resource scope. */
  async setPermissions(
    teamId: number,
    tenantId: number,
    perms: TeamPermissionInput[],
  ): Promise<TeamPermission[]> {
    await db.transaction(async (trx) => {
      await trx('team_permissions').where({ team_id: teamId, tenant_id: tenantId }).del();
      if (perms.length) {
        await trx('team_permissions').insert(
          perms.map((p) => ({
            tenant_id: tenantId,
            team_id: teamId,
            scope: p.scope,
            scope_id: p.scope === 'all' ? 0 : p.scopeId ?? 0,
            level: p.level ?? 'ro',
          })),
        );
      }
    });
    return this.getPermissions(teamId, tenantId);
  },
};
