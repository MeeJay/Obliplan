/**
 * The "master" (God View) tenant. Seeded at id=1 with slug='default' and
 * treated as immutable by the application.
 *
 * Platform admins (users.role='admin') connected to this tenant get
 * cross-tenant fan-out on listing endpoints. Non-admins have no special
 * privileges there - it's just the default workspace.
 */
export const MASTER_TENANT_ID = 1;
export const MASTER_TENANT_SLUG = 'default';

export function isMasterTenant(tenantId: number | null | undefined): boolean {
  return tenantId === MASTER_TENANT_ID;
}

/** Tenant slug validation - mirrors the DB constraint and Obligate's regex. */
export const TENANT_SLUG_RE = /^[a-z0-9-]{1,64}$/;
