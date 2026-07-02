import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { requireTenantCapability } from '../middleware/rbac';

// Sub-router mounted under the tenantRouter at /reports. Cross-cutting, read-only
// management reports: the Charge/workload aggregation and the Rapports analytics
// hub (KPI summary + time by project + by employee). All gated planning:read_team.
const router = Router();

router.get('/workload', requireTenantCapability('planning:read_team'), reportController.workload);
router.get('/summary', requireTenantCapability('planning:read_team'), reportController.summary);
router.get('/by-project', requireTenantCapability('planning:read_team'), reportController.byProject);
router.get('/by-user', requireTenantCapability('planning:read_team'), reportController.byUser);
router.get('/astreinte', requireTenantCapability('planning:read_team'), reportController.astreinte);

export default router;
