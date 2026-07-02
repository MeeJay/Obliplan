import { Router } from 'express';
import { shiftTemplateController } from '../controllers/shiftTemplate.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createShiftTemplateSchema, updateShiftTemplateSchema } from '../validators/schemas';

const router = Router();

// Read by anyone who can write planning (managers); managed via planning:write.
router.get('/', shiftTemplateController.list);
router.post('/', requireTenantCapability('planning:write'), validate(createShiftTemplateSchema), shiftTemplateController.create);
router.put('/:id', requireTenantCapability('planning:write'), validate(updateShiftTemplateSchema), shiftTemplateController.update);
router.delete('/:id', requireTenantCapability('planning:write'), shiftTemplateController.delete);

export default router;
