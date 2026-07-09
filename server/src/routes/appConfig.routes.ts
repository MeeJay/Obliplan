import { Router } from 'express';
import { z } from 'zod';
import { appConfigController } from '../controllers/appConfig.controller';
import { requireAuth } from '../middleware/auth';
import { requirePlatformAdmin } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { patchObligateSchema, patchSmtpSchema } from '../validators/schemas';

const testSmtpSchema = z.object({ to: z.string().email() });

// GLOBAL platform config (NOT tenant-scoped): About, Obligate SSO gateway, SMTP.
// Platform-admin only - a tenant admin must not read/alter cross-tenant settings.
const router = Router();
router.use(requireAuth, requirePlatformAdmin());

router.get('/system', appConfigController.system);
router.get('/obligate', appConfigController.getObligate);
router.patch('/obligate', validate(patchObligateSchema), appConfigController.patchObligate);
router.post('/obligate/import-users', appConfigController.importObligateUsers);
router.get('/smtp', appConfigController.getSmtp);
router.patch('/smtp', validate(patchSmtpSchema), appConfigController.patchSmtp);
router.post('/smtp/test', validate(testSmtpSchema), appConfigController.testSmtp);

export default router;
