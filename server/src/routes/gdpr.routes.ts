import { Router } from 'express';
import { gdprController } from '../controllers/gdpr.controller';
import { requireTenantCapability } from '../middleware/rbac';

const router = Router();

// Droit d'accès - any authenticated member downloads their OWN data.
router.get('/export/me', gdprController.exportMe);
// Admin (users:manage) exports / anonymises a member of the tenant.
router.get('/export/:id', requireTenantCapability('users:manage'), gdprController.exportUser);
router.post('/anonymize/:id', requireTenantCapability('users:manage'), gdprController.anonymize);

export default router;
