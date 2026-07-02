import { Router } from 'express';
import { overtimeNatureController } from '../controllers/overtimeNature.controller';
import { overtimeDeclarationController } from '../controllers/overtimeDeclaration.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  createOvertimeNatureSchema,
  updateOvertimeNatureSchema,
  createOvertimeDeclarationSchema,
  decideOvertimeDeclarationSchema,
  updateOvertimeDeclarationSchema,
  requestChangeOvertimeDeclarationSchema,
} from '../validators/overtime.schema';

const router = Router();

// Natures (config) - read by all, managed via overtime:natures:manage.
router.get('/natures', overtimeNatureController.list);
router.post('/natures', requireTenantCapability('overtime:natures:manage'), validate(createOvertimeNatureSchema), overtimeNatureController.create);
router.put('/natures/:id', requireTenantCapability('overtime:natures:manage'), validate(updateOvertimeNatureSchema), overtimeNatureController.update);
router.delete('/natures/:id', requireTenantCapability('overtime:natures:manage'), overtimeNatureController.delete);

// Declarations
router.get('/declarations/pending', requireTenantCapability('overtime:validate'), overtimeDeclarationController.pending);
router.get('/declarations/team-summary', requireTenantCapability('overtime:validate'), overtimeDeclarationController.teamSummary);
router.get('/declarations', overtimeDeclarationController.list);
router.post('/declarations', validate(createOvertimeDeclarationSchema), overtimeDeclarationController.create);
router.patch('/declarations/:id/decision', requireTenantCapability('overtime:validate'), validate(decideOvertimeDeclarationSchema), overtimeDeclarationController.decide);
// Owner edits own pending; owner requests a modification on a validated one (ownership checked in controller).
router.put('/declarations/:id', validate(updateOvertimeDeclarationSchema), overtimeDeclarationController.update);
router.patch('/declarations/:id/request-change', validate(requestChangeOvertimeDeclarationSchema), overtimeDeclarationController.requestChange);
// Delete: owner (pending) or overtime:validate (any) - authorization checked in controller.
router.delete('/declarations/:id', overtimeDeclarationController.remove);

export default router;
