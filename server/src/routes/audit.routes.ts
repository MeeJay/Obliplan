import { Router } from 'express';
import { auditController } from '../controllers/audit.controller';
import { requireTenantCapability } from '../middleware/rbac';

// Sub-router mounted under the tenantRouter at /audit. The trail is append-only
// (no create/update/delete route) and BOTH endpoints are gated by users:manage.
const router = Router();

router.get('/', requireTenantCapability('users:manage'), auditController.list);
router.get('/verify', requireTenantCapability('users:manage'), auditController.verify);

export default router;
