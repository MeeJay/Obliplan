import { Router } from 'express';
import { jourEcoleController } from '../controllers/jourEcole.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createJourEcoleSchema } from '../validators/schemas';

const router = Router();

router.get('/', jourEcoleController.list); // self or manager/admin (checked in controller)
router.post('/', requireTenantCapability('planning:write'), validate(createJourEcoleSchema), jourEcoleController.create);
router.delete('/:id', requireTenantCapability('planning:write'), jourEcoleController.delete);

export default router;
