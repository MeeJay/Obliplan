import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';

// Sub-router mounted under the tenantRouter at /notifications. The recipient is
// always the authenticated caller (req.session.userId); no extra capability gate.
const router = Router();

router.get('/', notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.patch('/:id/read', notificationController.markRead);
router.post('/read-all', notificationController.markAllRead);

export default router;
