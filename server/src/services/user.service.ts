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

  /** Direct reports of a manager who are members of the tenant. */
  async getTeam(managerId: number, tenantId: number): Promise<User[]> {
    const rows = await db<UserRow>('users')
      .join('user_tenants', 'users.id', 'user_tenants.user_id')
      .where('users.manager_id', managerId)
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

  /** Can `actor` manage `targetUserId`'s planning? Admin → any; manager → own reports. */
  async canManage(
    actor: { userId: number; role: string },
    targetUserId: number,
    tenantId: number,
  ): Promise<boolean> {
    if (actor.role === 'admin') return true;
    if (actor.userId === targetUserId) return false; // employees don't manage themselves
    if (actor.role !== 'manager') return false;
    const target = await db('users')
      .join('user_tenants', 'users.id', 'user_tenants.user_id')
      .where({ 'users.id': targetUserId, 'user_tenants.tenant_id': tenantId })
      .select('users.manager_id')
      .first<{ manager_id: number }>();
    return !!target && target.manager_id === actor.userId;
  },
};
