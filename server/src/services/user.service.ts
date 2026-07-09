import { db } from '../db';
import { rowToUser, type UserRow } from './auth.service';
import type { User } from '@obliplan/shared';

export const userService = {
  /**
   * All users who are MEMBERS of a tenant (admin/manager view), scoped by the
   * `user_tenants` membership table - NOT by `users.tenant_id` (home tenant).
   * God View (tenantId null) returns every user. Mirrors tenantService.getMembers.
   */
  async getByTenant(tenantId: number | null): Promise<User[]> {
    if (tenantId === null) {
      const all = await db<UserRow>('users').select('*').orderBy('display_name');
      return all.map(rowToUser);
    }
    const rows = await db<UserRow>('users')
      .join('user_tenants', 'users.id', 'user_tenants.user_id')
      .where('user_tenants.tenant_id', tenantId)
      .distinct('users.id')
      .select('users.*')
      .orderBy('users.display_name');
    return rows.map(rowToUser);
  },

  /**
   * Minimal active-user list any teammate may pick from (e.g. card assignee).
   * Scoped by tenant MEMBERSHIP (`user_tenants`), active members only.
   */
  async getAssignable(tenantId: number): Promise<{ id: number; displayName: string | null; username: string }[]> {
    const rows = await db<UserRow>('users')
      .join('user_tenants', 'users.id', 'user_tenants.user_id')
      .where('user_tenants.tenant_id', tenantId)
      .andWhere('users.is_active', true)
      .distinct('users.id')
      .select('users.id', 'users.display_name', 'users.username')
      .orderBy('users.display_name');
    return rows.map((r) => ({ id: r.id, displayName: r.display_name, username: r.username }));
  },

  /**
   * The set of user ids `startUserId` manages in a tenant, following the management graph
   * TRANSITIVELY (recursively). An edge A→B ("A manages B") exists when:
   *   - B has A as their direct manager (`users.manager_id = A`), OR
   *   - A is a 'manager' of an administrative team and B is another member of that team.
   * The closure follows those edges repeatedly (E→N, N→N's team, …), so a manager sees the
   * teams managed by the people they manage. Cycle-safe (visited set). Excludes the start user.
   */
  async resolveManagedUserIds(startUserId: number, tenantId: number): Promise<Set<number>> {
    // Edge source 1: direct reports (tenant members with manager_id set).
    const directRows = await db('users as u')
      .join('user_tenants as ut', 'ut.user_id', 'u.id')
      .where('ut.tenant_id', tenantId)
      .whereNotNull('u.manager_id')
      .select<{ id: number; manager_id: number }[]>('u.id', 'u.manager_id');

    // Edge source 2: administrative-team memberships (managers → members of the same team).
    const teamRows = await db('team_memberships as tm')
      .join('user_teams as t', 't.id', 'tm.team_id')
      .where('t.tenant_id', tenantId)
      .select<{ team_id: number; user_id: number; role: string }[]>('tm.team_id', 'tm.user_id', 'tm.role');

    // Build adjacency: managerId → Set(managed ids).
    const adj = new Map<number, Set<number>>();
    const link = (from: number, to: number) => {
      if (from === to) return;
      let s = adj.get(from);
      if (!s) adj.set(from, (s = new Set()));
      s.add(to);
    };
    for (const r of directRows) link(r.manager_id, r.id);

    const membersByTeam = new Map<number, number[]>();
    const managersByTeam = new Map<number, number[]>();
    for (const r of teamRows) {
      (membersByTeam.get(r.team_id) ?? membersByTeam.set(r.team_id, []).get(r.team_id)!).push(r.user_id);
      if (r.role === 'manager')
        (managersByTeam.get(r.team_id) ?? managersByTeam.set(r.team_id, []).get(r.team_id)!).push(r.user_id);
    }
    for (const [teamId, managers] of managersByTeam) {
      const members = membersByTeam.get(teamId) ?? [];
      for (const m of managers) for (const u of members) link(m, u); // link() skips self
    }

    // BFS over the graph from the start user.
    const managed = new Set<number>();
    const queue: number[] = [startUserId];
    const seen = new Set<number>([startUserId]);
    while (queue.length) {
      const node = queue.shift()!;
      for (const next of adj.get(node) ?? []) {
        if (next !== startUserId) managed.add(next);
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return managed;
  },

  /**
   * Everyone a manager manages (transitively, via direct reports AND administrative teams),
   * returned as full User rows scoped to tenant membership. Ordered by display name.
   */
  async getTeam(managerId: number, tenantId: number): Promise<User[]> {
    const ids = await this.resolveManagedUserIds(managerId, tenantId);
    if (ids.size === 0) return [];
    const rows = await db<UserRow>('users')
      .join('user_tenants', 'users.id', 'user_tenants.user_id')
      .whereIn('users.id', [...ids])
      .andWhere('user_tenants.tenant_id', tenantId)
      .distinct('users.id')
      .select('users.*')
      .orderBy('users.display_name');
    return rows.map(rowToUser);
  },

  /** A single member of the tenant, scoped by membership (not home tenant_id). */
  async getById(id: number, tenantId: number | null): Promise<User | null> {
    if (tenantId === null) {
      const row = await db<UserRow>('users').where({ id }).first();
      return row ? rowToUser(row) : null;
    }
    const row = await db<UserRow>('users')
      .join('user_tenants', 'users.id', 'user_tenants.user_id')
      .where({ 'users.id': id, 'user_tenants.tenant_id': tenantId })
      .select('users.*')
      .first();
    return row ? rowToUser(row) : null;
  },

  async update(
    id: number,
    tenantId: number,
    data: {
      displayName?: string | null;
      email?: string | null;
      role?: string;
      isActive?: boolean;
      contratId?: number | null;
      managerId?: number | null;
    },
  ): Promise<User | null> {
    // Membership guard (works for members whose home tenant_id differs).
    const member = await db('user_tenants').where({ user_id: id, tenant_id: tenantId }).first('user_id');
    if (!member) return null;
    const patch: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.displayName !== undefined) patch.display_name = data.displayName;
    if (data.email !== undefined) patch.email = data.email;
    if (data.role !== undefined) patch.role = data.role;
    if (data.isActive !== undefined) patch.is_active = data.isActive;
    if (data.contratId !== undefined) patch.contrat_id = data.contratId;
    if (data.managerId !== undefined) patch.manager_id = data.managerId;
    const [row] = await db<UserRow>('users').where({ id }).update(patch).returning('*');
    return row ? rowToUser(row) : null;
  },

  /**
   * Can `actor` manage `targetUserId`'s planning? Admin → any. Otherwise the actor manages
   * the target when the target is in the actor's TRANSITIVE managed set (direct reports +
   * administrative teams the actor manages, recursively). Self is never "managed" here
   * (callers short-circuit self before calling canManage).
   */
  async canManage(
    actor: { userId: number; role: string },
    targetUserId: number,
    tenantId: number,
  ): Promise<boolean> {
    if (actor.role === 'admin') return true;
    if (actor.userId === targetUserId) return false;
    const managed = await this.resolveManagedUserIds(actor.userId, tenantId);
    return managed.has(targetUserId);
  },
};
