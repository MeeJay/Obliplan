import { Router } from 'express';
import { contratController } from '../controllers/contrat.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createContratSchema, updateContratSchema } from '../validators/schemas';

const router = Router();

router.get('/', contratController.list);
router.get('/:id', contratController.getById);
router.post('/', requireTenantCapability('contrats:manage'), validate(createContratSchema), contratController.create);
router.put('/:id', requireTenantCapability('contrats:manage'), validate(updateContratSchema), contratController.update);
router.delete('/:id', requireTenantCapability('contrats:manage'), contratController.delete);

export default router;
