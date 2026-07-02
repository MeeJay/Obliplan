import { db } from '../db';
import { CAPABILITY_KEYS } from '@obliplan/shared';
import { permissionSetService } from './permissionSet.service';

export const permissionService = {
  /**
   * Resolve a user's capabilities in a tenant.
   *  - Platform admin (users.role='admin') → all capabilities.
   *  - Tenant role 'admin' (user_tenants.role) → all capabilities.
   *  - Otherwise → the permission set keyed by user_tenants.role.
   */
  async listUserTenantCapabilities(userId: number, tenantId: number, isPlatformAdmin: boolean): Promise<string[]> {
    if (isPlatformAdmin) return [...CAPABILITY_KEYS];
    const ut = await db('user_tenants').where({ user_id: userId, tenant_id: tenantId }).first<{ role: string }>();
    if (!ut) return [];
    if (ut.role === 'admin') return [...CAPABILITY_KEYS];
    const set = await permissionSetService.getBySlug(ut.role);
    return set ? set.capabilities : [];
  },

  async userHasTenantCapability(
    userId: number,
    tenantId: number,
    capability: string,
    isPlatformAdmin: boolean,
  ): Promise<boolean> {
    if (isPlatformAdmin) return true;
    const caps = await this.listUserTenantCapabilities(userId, tenantId, false);
    return caps.includes(capability);
  },
};
