import { Router } from 'express';
import { tenantModuleController } from '../controllers/tenantModule.controller';
import { requireAuth } from '../middleware/auth';
import { requireTenantCapability, requirePlatformAdmin } from '../middleware/rbac';

// Per-workspace module enablement for the ACTIVE workspace. Mounted on the tenant
// router (requireAuth + requireTenant already applied).
const router = Router();

router.get('/', tenantModuleController.list);
router.patch('/', requireTenantCapability('tenants:manage'), tenantModuleController.setEnabled);

export default router;

// Module enablement for an ARBITRARY workspace addressed by :id (the platform
// Workspaces screen). Platform-admin only - it targets any tenant, not just the
// caller's active one, so it is a cross-tenant (global) operation.
export const tenantModuleAdminRouter = Router();
tenantModuleAdminRouter.use(requireAuth);
tenantModuleAdminRouter.get('/:id/modules', requirePlatformAdmin(), tenantModuleController.getForTenant);
tenantModuleAdminRouter.patch('/:id/modules', requirePlatformAdmin(), tenantModuleController.setForTenant);
