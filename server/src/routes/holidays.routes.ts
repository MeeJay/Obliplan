import { Router } from 'express';
import { holidayController } from '../controllers/holiday.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { createHolidaySchema } from '../validators/schemas';

const router = Router();

// Read by any authenticated tenant user (calc + display); custom rows managed via planning:write.
router.get('/', holidayController.list);
router.post('/', requireTenantCapability('planning:write'), validate(createHolidaySchema), holidayController.create);
router.delete('/:id', requireTenantCapability('planning:write'), holidayController.delete);

export default router;
