import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/sso-config', authController.ssoConfig);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
router.patch('/me/shift-notify', requireAuth, authController.setShiftNotify);
router.post('/me/test-notify', requireAuth, authController.testNotify);
router.get('/connected-apps', requireAuth, authController.connectedApps);

export default router;
