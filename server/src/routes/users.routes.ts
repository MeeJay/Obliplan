import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { requireManager, requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createUserSchema, updateUserSchema } from '../validators/schemas';

const router = Router();

router.get('/', requireManager(), userController.list);
// Minimal directory any authenticated teammate can read (assignee pickers, etc.).
// Must precede '/:id' so it is not swallowed by the param route.
router.get('/assignable', userController.listAssignable);
// Users the caller may log time / act on-behalf-of (admin → all, manager → reports). Before '/:id'.
router.get('/manageable', userController.listManageable);
router.post('/', requireTenantCapability('users:manage'), validate(createUserSchema), userController.create);
router.get('/:id', requireManager(), userController.getById);
router.put('/:id', requireTenantCapability('users:manage'), validate(updateUserSchema), userController.update);

export default router;
