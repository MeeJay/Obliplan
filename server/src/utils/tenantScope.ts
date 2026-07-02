import type { Request } from 'express';
import { isMasterTenant } from '@obliplan/shared';

/**
 * Resolve the tenant scope for a listing request:
 *   - Platform admin (users.role='admin') on the master tenant → null
 *     = cross-tenant fan-out (God View).
 *   - Anyone else → req.tenantId, scoped to the active tenant.
 *
 * Service list methods accept `number | null` and skip the
 * `WHERE tenant_id = ?` clause when null.
 *
 * Call after requireAuth + requireTenant.
 */
export function getEffectiveTenantScope(req: Request): number | null {
  if (req.session?.platformAdmin && isMasterTenant(req.tenantId)) {
    return null;
  }
  return req.tenantId;
}

export function isGodView(req: Request): boolean {
  return !!req.session?.platformAdmin && isMasterTenant(req.tenantId);
}
