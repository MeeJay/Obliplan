import { Router } from 'express';
import { permissionSetController } from '../controllers/permissionSet.controller';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';

// Global permission sets (slug × capabilities matrix). Managed by admins.
const router = Router();
router.use(requireAuth);

router.get('/', permissionSetController.list);
router.get('/capabilities', permissionSetController.capabilities);
router.post('/', requireAdmin(), permissionSetController.create);
router.put('/:id', requireAdmin(), permissionSetController.update);
router.delete('/:id', requireAdmin(), permissionSetController.delete);

export default router;
