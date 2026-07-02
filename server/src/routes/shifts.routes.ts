import { Router } from 'express';
import { shiftController } from '../controllers/shift.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createShiftSchema, updateShiftSchema } from '../validators/schemas';

const router = Router();

router.get('/', shiftController.list); // self or manager/admin (checked in controller)
router.post('/', requireTenantCapability('planning:write'), validate(createShiftSchema), shiftController.create);
router.put('/:id', requireTenantCapability('planning:write'), validate(updateShiftSchema), shiftController.update);
router.delete('/:id', requireTenantCapability('planning:write'), shiftController.delete);

export default router;
