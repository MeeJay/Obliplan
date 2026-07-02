import { Router } from 'express';
import { teamController } from '../controllers/team.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import {
  createTeamSchema,
  updateTeamSchema,
  setTeamMembersSchema,
  setTeamPermissionsSchema,
} from '../validators/team.schema';

// User teams (Axis C of the permission matrix). Management is gated behind the
// users:manage capability (admins bypass via requireTenantCapability).
const router = Router();
const manage = requireTenantCapability('users:manage');

router.get('/', manage, teamController.list);
router.post('/', manage, validate(createTeamSchema), teamController.create);
router.put('/:id', manage, validate(updateTeamSchema), teamController.update);
router.delete('/:id', manage, teamController.delete);

router.get('/:id/members', manage, teamController.getMembers);
router.put('/:id/members', manage, validate(setTeamMembersSchema), teamController.setMembers);

router.get('/:id/permissions', manage, teamController.getPermissions);
router.put('/:id/permissions', manage, validate(setTeamPermissionsSchema), teamController.setPermissions);

export default router;
