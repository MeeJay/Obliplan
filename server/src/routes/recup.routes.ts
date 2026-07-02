import { Router } from 'express';
import { recupController } from '../controllers/recup.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createRecupSchema } from '../validators/schemas';
import { validateWeekSchema, selfServiceSchema } from '../validators/recup.schema';

const router = Router();

router.get('/', recupController.list); // self or manager/admin (checked in controller)
router.get('/week-preview', requireTenantCapability('recup:manage'), recupController.weekPreview);
router.post('/validate-week', requireTenantCapability('recup:manage'), validate(validateWeekSchema), recupController.validateWeek);
router.patch('/self-service', requireTenantCapability('recup:manage'), validate(selfServiceSchema), recupController.setSelfService);
router.post('/', requireTenantCapability('recup:manage'), validate(createRecupSchema), recupController.create);
router.delete('/:id', requireTenantCapability('recup:manage'), recupController.delete);

export default router;
