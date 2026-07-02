import { Router } from 'express';
import { tenantController } from '../controllers/tenant.controller';
import { requireAuth } from '../middleware/auth';
import { requirePlatformAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createTenantSchema, updateTenantSchema } from '../validators/schemas';

const router = Router();
router.use(requireAuth);

// Current user
router.get('/', tenantController.list); // /api/tenants - my workspaces
router.post('/switch', tenantController.switch); // /api/tenant/switch

// Platform admin: all-tenants / workspace management (create/delete tenants, cross-
// tenant members) - global scope, so a mere tenant admin must not reach it.
router.get('/all', requirePlatformAdmin(), tenantController.listAll);
router.post('/', requirePlatformAdmin(), validate(createTenantSchema), tenantController.create);
router.put('/:id', requirePlatformAdmin(), validate(updateTenantSchema), tenantController.update);
router.delete('/:id', requirePlatformAdmin(), tenantController.remove);
router.get('/:id/members', requirePlatformAdmin(), tenantController.members);
router.post('/:id/members', requirePlatformAdmin(), tenantController.addMember);
router.delete('/:id/members/:userId', requirePlatformAdmin(), tenantController.removeMember);

export default router;
