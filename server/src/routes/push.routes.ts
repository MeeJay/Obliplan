import { Router } from 'express';
import { pushController } from '../controllers/push.controller';

// Authed (tenant router) - the signed-in user manages their OWN device push
// subscriptions. No capability gate: opting a device in/out is a personal action.
const router = Router();
router.get('/public-key', pushController.publicKey);
router.post('/subscribe', pushController.subscribe);
router.post('/unsubscribe', pushController.unsubscribe);

export default router;
