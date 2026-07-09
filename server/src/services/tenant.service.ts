import { db } from '../db';
import { MASTER_TENANT_ID, MASTER_TENANT_SLUG } from '@obliplan/shared';
import type { Tenant, TenantWithRole, TenantRole } from '@obliplan/shared';
import { logger } from '../utils/logger';

interface TenantRow {
  id: number;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
}

function rowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export const tenantService = {
  /** Create the master (God View) tenant at id=1 if it doesn't exist. */
  async ensureMasterTenant(): Promise<void> {
    const existing = await db('tenants').where({ slug: MASTER_TENANT_SLUG }).first();
    if (existing) return;
    await db('tenants').insert({ id: MASTER_TENANT_ID, name: 'Default', slug: MASTER_TENANT_SLUG });
    // Keep the serial sequence ahead of the explicit id we just inserted.
    await db.raw("SELECT setval(pg_get_serial_sequence('tenants','id'), (SELECT MAX(id) FROM tenants))");
    logger.info('Master tenant created');
  },

  async getAll(): Promise<Tenant[]> {
    const rows = await db<TenantRow>('tenants').select('*').orderBy('id');
    return rows.map(rowToTenant);
  },

  async getById(id: number): Promise<Tenant | null> {
    const row = await db<TenantRow>('tenants').where({ id }).first();
    return row ? rowToTenant(row) : null;
  },

  async getBySlug(slug: string): Promise<Tenant | null> {
    const row = await db<TenantRow>('tenants').where({ slug }).first();
    return row ? rowToTenant(row) : null;
  },

  async create(data: { name: string; slug: string }): Promise<Tenant> {
    const [row] = await db<TenantRow>('tenants').insert(data).returning('*');
    return rowToTenant(row);
  },

  async update(id: number, data: { name?: string; slug?: string }): Promise<Tenant | null> {
    const [row] = await db<TenantRow>('tenants')
      .where({ id })
      .update({ ...data, updated_at: db.fn.now() })
      .returning('*');
    return row ? rowToTenant(row) : null;
  },

  async delete(id: number): Promise<void> {
    await db('tenants').where({ id }).delete();
  },

  /** First tenant accessible by the user (lowest id). */
  async getFirstTenantForUser(userId: number): Promise<Tenant | null> {
    const row = await db<TenantRow>('tenants')
      .join('user_tenants', 'tenants.id', 'user_tenants.tenant_id')
      .where('user_tenants.user_id', userId)
      .orderBy('tenants.id')
      .first('tenants.*');
    return row ? rowToTenant(row as TenantRow) : null;
  },

  /** All tenants accessible by the user, with their per-tenant role. */
  async getTenantsForUser(userId: number): Promise<TenantWithRole[]> {
    const rows = await db('tenants')
      .join('user_tenants', 'tenants.id', 'user_tenants.tenant_id')
      .where('user_tenants.user_id', userId)
      .orderBy('tenants.id')
      .select<(TenantRow & { role: string })[]>('tenants.*', 'user_tenants.role');
    return rows.map((r) => ({ ...rowToTenant(r), role: r.role as TenantRole }));
  },

  /** The user's chosen default workspace id, or null if none set. */
  async getPreferredTenant(userId: number): Promise<number | null> {
    const row = await db('users').where({ id: userId }).first<{ preferred_tenant_id: number | null }>('preferred_tenant_id');
    return row?.preferred_tenant_id ?? null;
  },

  /** Set (or clear, with null) the user's default workspace. Caller validates access. */
  async setPreferredTenant(userId: number, tenantId: number | null): Promise<void> {
    await db('users').where({ id: userId }).update({ preferred_tenant_id: tenantId, updated_at: db.fn.now() });
  },

  async userHasAccess(userId: number, tenantId: number): Promise<boolean> {
    const row = await db('user_tenants').where({ user_id: userId, tenant_id: tenantId }).first('user_id');
    return !!row;
  },

  /** The user's role IN a specific tenant (from user_tenants), or null if not a member. */
  async getUserTenantRole(userId: number, tenantId: number): Promise<string | null> {
    const row = await db('user_tenants')
      .where({ user_id: userId, tenant_id: tenantId })
      .first<{ role: string }>('role');
    return row?.role ?? null;
  },

  /** Members of a tenant with their per-tenant role. */
  async getMembers(tenantId: number): Promise<
    Array<{ id: number; username: string; displayName: string | null; email: string | null; role: string; tenantRole: string }>
  > {
    return db('users')
      .join('user_tenants', 'users.id', 'user_tenants.user_id')
      .where('user_tenants.tenant_id', tenantId)
      .select(
        'users.id',
        'users.username',
        'users.display_name as displayName',
        'users.email',
        'users.role',
        db.raw('user_tenants.role as "tenantRole"'),
      )
      .orderBy('users.display_name');
  },

  async addUser(tenantId: number, userId: number, role: TenantRole): Promise<void> {
    await db('user_tenants')
      .insert({ tenant_id: tenantId, user_id: userId, role })
      .onConflict(['user_id', 'tenant_id'])
      .merge({ role });
  },

  async removeUser(tenantId: number, userId: number): Promise<void> {
    await db('user_tenants').where({ tenant_id: tenantId, user_id: userId }).delete();
  },
};
