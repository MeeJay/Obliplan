import { Router } from 'express';
import { planningController } from '../controllers/planning.controller';
import { planningImportController } from '../controllers/planningImport.controller';
import { planningViewController } from '../controllers/planningView.controller';
import { requireTenantCapability } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { cloneShiftsSchema, copyWeekSchema, publishWeekSchema, restoreWeekSchema } from '../validators/schemas';

const router = Router();

router.get('/me', planningController.me);
router.get('/me/month', planningController.meMonth);
router.get('/week', planningController.week);
router.get('/team', requireTenantCapability('planning:read_team'), planningController.team);
router.get('/team-overview', requireTenantCapability('planning:view_team'), planningController.teamOverview);
// Team visibility filter + per-user saved "views" (owner-scoped). All gated planning:view_team
// (seeded to admin+manager+employé, so every authorized viewer can list/save their own presets).
router.get('/teams', requireTenantCapability('planning:view_team'), planningController.teams);
router.get('/views', requireTenantCapability('planning:view_team'), planningViewController.list);
router.post('/views', requireTenantCapability('planning:view_team'), planningViewController.create);
router.put('/views/:id', requireTenantCapability('planning:view_team'), planningViewController.update);
router.delete('/views/:id', requireTenantCapability('planning:view_team'), planningViewController.remove);
router.post('/copy-week', requireTenantCapability('planning:write'), validate(copyWeekSchema), planningController.copyWeek);
router.post('/clone-shifts', requireTenantCapability('planning:write'), validate(cloneShiftsSchema), planningController.cloneShifts);
router.post('/restore-week', requireTenantCapability('planning:write'), validate(restoreWeekSchema), planningController.restoreWeek);
router.post('/publish', requireTenantCapability('planning:write'), validate(publishWeekSchema), planningController.publish);
router.post('/import/preview', requireTenantCapability('planning:write'), planningImportController.preview);
router.post('/import/apply', requireTenantCapability('planning:write'), planningImportController.apply);

export default router;
