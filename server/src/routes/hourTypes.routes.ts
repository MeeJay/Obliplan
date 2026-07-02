import { Router } from 'express';
import { hourTypeController } from '../controllers/hourType.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createHourTypeSchema, updateHourTypeSchema } from '../validators/hourType.schema';

const router = Router();

// Hour types (config) - read by all, managed by the dedicated capability.
router.get('/', hourTypeController.list);
router.post('/', requireTenantCapability('hourtypes:manage'), validate(createHourTypeSchema), hourTypeController.create);
router.put('/:id', requireTenantCapability('hourtypes:manage'), validate(updateHourTypeSchema), hourTypeController.update);
router.delete('/:id', requireTenantCapability('hourtypes:manage'), hourTypeController.delete);

export default router;
