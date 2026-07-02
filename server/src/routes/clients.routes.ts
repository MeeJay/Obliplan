import { Router } from 'express';
import { clientController } from '../controllers/client.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createClientSchema, updateClientSchema } from '../validators/client.schema';

const router = Router();

router.get('/', clientController.list);
router.get('/:id', clientController.getById);
router.post('/', requireTenantCapability('clients:manage'), validate(createClientSchema), clientController.create);
router.put('/:id', requireTenantCapability('clients:manage'), validate(updateClientSchema), clientController.update);
router.delete('/:id', requireTenantCapability('clients:manage'), clientController.delete);

export default router;
