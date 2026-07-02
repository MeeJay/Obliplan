import { Router } from 'express';
import { leaveTypeController } from '../controllers/leaveType.controller';
import { leaveRequestController } from '../controllers/leaveRequest.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
} from '../validators/schemas';

const router = Router();

// Leave types (config) - read by all, managed via leave:types:manage.
router.get('/types', leaveTypeController.list);
router.post('/types', requireTenantCapability('leave:types:manage'), validate(createLeaveTypeSchema), leaveTypeController.create);
router.put('/types/:id', requireTenantCapability('leave:types:manage'), validate(updateLeaveTypeSchema), leaveTypeController.update);
router.delete('/types/:id', requireTenantCapability('leave:types:manage'), leaveTypeController.delete);

// Team absence calendar (leave:validate) - approved + pending leave for a month.
router.get('/calendar', requireTenantCapability('leave:validate'), leaveRequestController.calendar);

// Leave requests
router.get('/requests/pending', requireTenantCapability('leave:validate'), leaveRequestController.pending);
router.get('/requests/balances', leaveRequestController.balances);
router.get('/requests', leaveRequestController.list);
router.post('/requests', validate(createLeaveRequestSchema), leaveRequestController.create);
router.patch('/requests/:id/decision', requireTenantCapability('leave:validate'), validate(decideLeaveRequestSchema), leaveRequestController.decide);
router.patch('/requests/:id/cancel', leaveRequestController.cancel);

export default router;
