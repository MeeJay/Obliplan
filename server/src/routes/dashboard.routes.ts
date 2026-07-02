import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';

// Sub-router mounted under the tenantRouter at /dashboard. Aggregates read-only
// home widgets for the authenticated caller (req.session.userId).
const router = Router();

router.get('/me', dashboardController.me);

export default router;
